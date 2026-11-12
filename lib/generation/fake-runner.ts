import 'server-only';
import { eq } from 'drizzle-orm';
import { after } from 'next/server';
import { db } from '@/lib/db';
import { draft, draftPrompt, githubRepository } from '@/lib/db/schema';
import { sendGenerationSignal } from '@/lib/generation/broadcast';
import type {
  GenerationErrorCode,
  GenerationRequest,
  GenerationStatus,
  GenerationStep,
} from '@/lib/generation/contract';
import {
  buildFakeFillMarkdown,
  buildFakeResultMarkdown,
  type FakeResultCommit,
} from '@/lib/generation/fake-result';
import {
  FAKE_CLARIFICATION,
  getFakeSimulation,
} from '@/lib/generation/fake-simulation';
import {
  completeJob,
  failJob,
  markJobRunning,
  markJobStep,
  pauseJobForInput,
} from '@/lib/generation/jobs';
import type { GenerationRunner } from '@/lib/generation/runner';
import {
  getUserCommit,
  GithubApiError,
  GithubUserTokenError,
} from '@/lib/github/user-api';
import { getCommitSubject } from '@/lib/studio/draft-content';

/**
 * [임시] 가짜 작성 실행기 (작성 Lambda 연동 전 화면 흐름 확인용, LLM 호출 없음)
 * - Lambda 와 같은 순서로 동작: 응답 후(after) 시작 → running → 커밋 상세 1회 조회
 *   → 구분(1) → 분석(2) → 작성(3) 단계마다 DB 갱신 + Realtime 신호 → 결과 Markdown 저장 후 완료
 * - 개발 환경에서만 요청 문구에 [fail] 을 넣으면 분석 단계에서 실패, [stall] 을 넣으면 구분 단계 후 멈춤(시간 초과 확인),
 *   [clarify] 를 넣으면 커밋 조회 뒤 답변 대기(awaiting_input)로 멈춤 (답하고 재실행하면 평소처럼 완료)
 * - 빈칸 채우기 작업은 GitHub 조회와 단계 없이 잠시 뒤 답을 그대로 한 문단으로 완료 (답에 [fail]/[stall] 도 같은 동작)
 */

// 단계 사이 대기 시간
const FAKE_STEP_DELAY_MS = 1700;

// 가짜 작업이 완료될 때 기록하는 사용량 (할당량 화면 확인용)
export const FAKE_USED_TOKENS = 30_000;
export const FAKE_FILL_USED_TOKENS = 3_000;

// 되묻기 흉내 상수와 판단 함수는 순수 모듈에 있고, 기존 import 경로 유지를 위해 다시 내보냄
export {
  FAKE_CLARIFICATION,
  FAKE_CLARIFY_KEYWORD,
  FAKE_FAIL_KEYWORD,
  FAKE_STALL_KEYWORD,
  getFakeSimulation,
} from '@/lib/generation/fake-simulation';

class GenerationFailure extends Error {
  constructor(readonly code: GenerationErrorCode) {
    super(code);
  }
}

const toGenerationFailure = (error: unknown) => {
  if (error instanceof GenerationFailure) {
    return error;
  }

  if (error instanceof GithubUserTokenError) {
    return new GenerationFailure('github_reauth');
  }

  if (error instanceof GithubApiError) {
    return new GenerationFailure(
      error.status === 401 ? 'github_reauth' : 'github_unavailable',
    );
  }

  return new GenerationFailure('internal');
};

// 작업에 필요한 값 (종류, 요청 문구, 빈칸 답, 되묻기, 커밋 SHA, 저장소)
const loadJobContext = async (jobId: string) => {
  const [context] = await db
    .select({
      kind: draftPrompt.kind,
      prompt: draftPrompt.prompt,
      blankAnswer: draftPrompt.blankAnswer,
      clarification: draftPrompt.clarification,
      commitShas: draftPrompt.commitShas,
      owner: githubRepository.ownerLogin,
      repo: githubRepository.name,
    })
    .from(draftPrompt)
    .innerJoin(draft, eq(draftPrompt.draftId, draft.id))
    .innerJoin(githubRepository, eq(draft.repositoryId, githubRepository.id))
    .where(eq(draftPrompt.id, jobId))
    .limit(1);

  return context ?? null;
};

// 선택한 커밋의 상세를 GitHub 에서 한 번 조회 (Lambda 와 같은 방식)
const fetchCommits = async (
  token: string,
  {
    owner,
    repo,
    commitShas,
  }: { owner: string; repo: string; commitShas: string[] },
): Promise<FakeResultCommit[]> => {
  const details = await Promise.all(
    commitShas.map((sha) => getUserCommit(token, { owner, repo, sha })),
  );

  return details.map((detail) => ({
    sha: detail.sha,
    subject: getCommitSubject(detail.commit.message),
    htmlUrl: detail.html_url,
    files: (detail.files ?? []).map(({ filename }) => filename),
  }));
};

interface FakeRunnerDependencies {
  wait: (ms: number) => Promise<void>;
  stepDelayMs: number;
}

const defaultWait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 가짜 작업 한 건 실행 (테스트에서 직접 호출할 수 있도록 실행기와 분리)
 */
export const runFakeJob = async (
  { jobId, githubToken }: GenerationRequest,
  { wait, stepDelayMs }: FakeRunnerDependencies = {
    wait: defaultWait,
    stepDelayMs: FAKE_STEP_DELAY_MS,
  },
) => {
  const started = await markJobRunning(jobId);

  if (!started) {
    return;
  }

  let currentStep: GenerationStep = 0;
  const signal = (status: GenerationStatus) =>
    sendGenerationSignal(started.channel, { jobId, status, step: currentStep });

  // 단계를 마치고 신호를 보냄 (그 사이 시간 초과 등으로 끝난 작업이면 false)
  const advance = async (step: GenerationStep) => {
    await wait(stepDelayMs);

    if (!(await markJobStep(jobId, step))) {
      return false;
    }

    currentStep = step;
    await signal('running');
    return true;
  };

  await signal('running');

  try {
    const context = await loadJobContext(jobId);

    if (!context) {
      throw new GenerationFailure('internal');
    }

    // 빈칸 채우기 작업의 prompt 는 글쓴이 답
    const simulation = getFakeSimulation(context.prompt);

    if (context.kind === 'fill') {
      await wait(stepDelayMs);

      if (simulation === 'stall') {
        return;
      }

      if (simulation === 'fail') {
        throw new GenerationFailure('llm_failed');
      }

      const result = buildFakeFillMarkdown(
        context.blankAnswer ?? context.prompt,
      );

      if (await completeJob(jobId, result, FAKE_FILL_USED_TOKENS)) {
        currentStep = 3;
        await signal('completed');
      }

      return;
    }

    const commits = await fetchCommits(githubToken, context);

    // 처음 실행이면 질문을 남기고 멈춤 (재실행은 clarification 이 있어 그대로 진행)
    if (simulation === 'clarify' && context.clarification === null) {
      if (await pauseJobForInput(jobId, FAKE_CLARIFICATION)) {
        await signal('awaiting_input');
      }

      return;
    }

    if (!(await advance(1)) || simulation === 'stall') {
      return;
    }

    if (simulation === 'fail') {
      await wait(stepDelayMs);
      throw new GenerationFailure('llm_failed');
    }

    if (!(await advance(2))) {
      return;
    }

    await wait(stepDelayMs);
    const result = buildFakeResultMarkdown({ prompt: context.prompt, commits });

    if (await completeJob(jobId, result, FAKE_USED_TOKENS)) {
      currentStep = 3;
      await signal('completed');
    }
  } catch (error) {
    if (await failJob(jobId, toGenerationFailure(error).code)) {
      await signal('failed');
    }
  }
};

// 응답을 보낸 뒤(after) 가짜 작업을 실행하는 실행기
export const createFakeRunner = (
  schedule: (task: () => Promise<void>) => void = after,
): GenerationRunner => ({
  start: async (request) => {
    schedule(() => runFakeJob(request));
  },
});
