'use server';

import type { JSONContent } from '@tiptap/core';
import { asc, eq } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { draft, draftPrompt, draftReferenceLink } from '@/lib/db/schema';
import {
  buildBlankContext,
  getBlankQuestion,
  parseBlankFillRequest,
  type BlankFillRequest,
} from '@/lib/generation/blank-fill';
import { getDefaultBlankQuestions } from '@/lib/generation/blank-questions';
import { getGenerationRunner } from '@/lib/generation/get-runner';
import {
  applyCompletedJob,
  claimFillJob,
  clearFailedFillContexts,
  countUserJobsSince,
  expireStaleJobs,
  failJob,
  getFillJobParagraphs,
  getLatestDraftJobOptions,
  getUserJob,
  isActiveJobConflict,
  syncDraftJobs,
  type GenerationJobView,
} from '@/lib/generation/jobs';
import {
  GENERATION_HOURLY_LIMIT,
  GENERATION_RATE_WINDOW_MS,
  MAX_GENERATION_COMMITS,
  MAX_GENERATION_PROMPT_LENGTH,
} from '@/lib/generation/limits';
import { getUserQuota } from '@/lib/generation/quota-queries';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { getRequestLocale } from '@/lib/i18n/request';
import {
  getGithubUserToken,
  GithubUserTokenError,
} from '@/lib/github/user-api';
import { ensureBlankIds, findBlank } from '@/lib/studio/draft-blank';
import { isDraftDocument } from '@/lib/studio/draft-content';
import {
  DEFAULT_PROMPT_OPTIONS,
  parsePromptOptions,
  type PromptOptions,
} from '@/lib/studio/options';
import { getStudioRepository, isOwnedDraft } from '@/lib/studio/queries';
import { parseReferenceUrls } from '@/lib/studio/reference-link';

export interface RequestDraftGenerationInput {
  repositoryId: string;
  // null 이면 새 초안
  draftId: string | null;
  prompt: string;
  options: unknown;
  // 선택한 커밋 SHA (최신순)
  commitShas: string[];
  // 새 초안에 함께 저장할 참고 링크 (저장된 초안은 링크를 바로 저장하므로 보내지 않음)
  referenceLinks?: string[];
}

export type RequestDraftGenerationResult =
  | {
      status: 'started';
      draftId: string;
      isNewDraft: boolean;
      job: GenerationJobView;
    }
  // 이 초안에 이미 진행 중인 작업이 있음
  | { status: 'busy' }
  | { status: 'rate_limited' }
  // 이번 주 사용량을 모두 사용함 (resetsAt 은 ISO)
  | { status: 'quota_exhausted'; resetsAt: string }
  // 등급의 할당량 정책이 없어 확인할 수 없음
  | { status: 'quota_unavailable' }
  | { status: 'invalid' }
  | { status: 'not_found' }
  | { status: 'github_reauth' }
  // 작성기를 시작하지 못함 (작업은 실패 처리되어 잠금 해제)
  | { status: 'runner_unavailable' };

const SHA_PATTERN = /^[0-9a-f]{40}$/;

interface ParsedRequest {
  prompt: string;
  options: PromptOptions;
  commitShas: string[];
  referenceUrls: string[];
  draftId: string | null;
}

// 요청 값 검증 (형식이 맞지 않거나 제한을 넘으면 null)
const parseRequest = (
  input: RequestDraftGenerationInput,
): ParsedRequest | null => {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const options = parsePromptOptions(input.options);
  const referenceUrls = parseReferenceUrls(input.referenceLinks);
  const draftId = typeof input.draftId === 'string' ? input.draftId : null;
  const commitShas = Array.isArray(input.commitShas) ? input.commitShas : null;

  if (
    !prompt ||
    prompt.length > MAX_GENERATION_PROMPT_LENGTH ||
    !options ||
    !referenceUrls ||
    !commitShas ||
    commitShas.length === 0 ||
    commitShas.length > MAX_GENERATION_COMMITS ||
    !commitShas.every((sha) => typeof sha === 'string' && SHA_PATTERN.test(sha))
  ) {
    return null;
  }

  return {
    prompt,
    options,
    commitShas: [...new Set(commitShas)],
    referenceUrls,
    draftId,
  };
};

/**
 * 작업(queued)을 만들고 초안 id 와 작업 id 반환 (새 초안이면 초안과 참고 링크도 함께 생성)
 * - 같은 초안에 진행 중인 작업이 있으면 유일 인덱스에 걸려 'busy'
 */
const createJob = async (
  userId: string,
  repositoryId: string,
  request: ParsedRequest,
  locale: Locale,
) => {
  const draftId = request.draftId ?? crypto.randomUUID();
  const jobId = crypto.randomUUID();

  try {
    await db.transaction(async (tx) => {
      // 요청 시점의 참고 링크 (작성기는 이 목록만 읽음)
      let referenceUrls = request.referenceUrls;

      if (request.draftId) {
        // 최근 수정순 목록의 맨 위로 올림
        await tx
          .update(draft)
          .set({ updatedAt: new Date() })
          .where(eq(draft.id, draftId));

        const links = await tx
          .select({ url: draftReferenceLink.url })
          .from(draftReferenceLink)
          .where(eq(draftReferenceLink.draftId, draftId))
          .orderBy(
            asc(draftReferenceLink.createdAt),
            asc(draftReferenceLink.id),
          );
        referenceUrls = links.map((link) => link.url);
      } else {
        await tx.insert(draft).values({ id: draftId, userId, repositoryId });

        if (request.referenceUrls.length > 0) {
          await tx.insert(draftReferenceLink).values(
            request.referenceUrls.map((url) => ({
              id: crypto.randomUUID(),
              draftId,
              url,
            })),
          );
        }
      }

      await tx.insert(draftPrompt).values({
        id: jobId,
        userId,
        draftId,
        prompt: request.prompt,
        tone: request.options.tone,
        postType: request.options.postType,
        length: request.options.length,
        requiredBlocks: request.options.requiredBlocks,
        commitShas: request.commitShas,
        referenceUrls,
        locale,
      });
    });
  } catch (error) {
    if (isActiveJobConflict(error)) {
      return null;
    }

    throw error;
  }

  return { draftId, jobId };
};

// 작업을 만들기 전 사용자 단위 검사 결과 (통과하면 실행기에 넘길 GitHub 토큰)
type GenerationGateResult =
  | { status: 'ok'; githubToken: string }
  | { status: 'rate_limited' }
  | { status: 'quota_exhausted'; resetsAt: string }
  | { status: 'quota_unavailable' }
  | { status: 'github_reauth' };

/**
 * 작업을 만들기 전 사용자 단위 검사 (초안 작성과 빈칸 채우기 공용)
 * 1. 시간당 요청 수
 * 2. 멈춘 작업 시간 초과 처리 후 이번 주 할당량 (정책이 없거나 소진이면 거부)
 * 3. GitHub 토큰 (실행기 요청 형식에 필요)
 */
const checkGenerationGate = async (
  userId: string,
): Promise<GenerationGateResult> => {
  const since = new Date(Date.now() - GENERATION_RATE_WINDOW_MS);

  if ((await countUserJobsSince(userId, since)) >= GENERATION_HOURLY_LIMIT) {
    return { status: 'rate_limited' };
  }

  // 멈춘 작업(Lambda 비정상 종료)의 예상량이 계속 사용량으로 잡히지 않도록 먼저 시간 초과 처리
  await expireStaleJobs({ userId });

  const quota = await getUserQuota(userId);

  if (!quota) {
    return { status: 'quota_unavailable' };
  }

  if (quota.remaining <= 0) {
    return {
      status: 'quota_exhausted',
      resetsAt: quota.resetsAt.toISOString(),
    };
  }

  try {
    return {
      status: 'ok',
      githubToken: await getGithubUserToken(userId, await headers()),
    };
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return { status: 'github_reauth' };
    }

    throw error;
  }
};

/**
 * AI 작성 요청
 * 1. 세션, 저장소/초안 소유, 입력 제한, 시간당 요청 수 확인
 * 2. (새 초안이면 초안을 만들고) 작업을 queued 로 저장 → 진행 중 작업이 있으면 busy
 * 3. 작성기 시작 (가짜 또는 Lambda). 시작하지 못하면 작업을 실패 처리해 잠금 해제
 * - 작업 진행은 작업의 channel 로 Realtime 신호를 받고 getGenerationStatus 로 다시 읽어 확인
 */
export async function requestDraftGeneration(
  input: RequestDraftGenerationInput,
): Promise<RequestDraftGenerationResult> {
  const { user } = await requireSession();
  const request = parseRequest(input);

  if (!request) {
    return { status: 'invalid' };
  }

  const repository = await getStudioRepository(user.id, input.repositoryId);

  if (
    !repository ||
    (request.draftId &&
      !(await isOwnedDraft(user.id, repository.id, request.draftId)))
  ) {
    return { status: 'not_found' };
  }

  const gate = await checkGenerationGate(user.id);

  if (gate.status !== 'ok') {
    return gate;
  }

  if (request.draftId) {
    // 시간 초과된 작업을 먼저 정리해야 새 작업을 받을 수 있음
    await syncDraftJobs(request.draftId);
  }

  // 요청한 화면의 언어로 프롬프트를 보내고 글을 작성
  const created = await createJob(
    user.id,
    repository.id,
    request,
    await getRequestLocale(),
  );

  if (!created) {
    return { status: 'busy' };
  }

  try {
    await getGenerationRunner().start({
      jobId: created.jobId,
      githubToken: gate.githubToken,
    });
  } catch {
    await failJob(created.jobId, 'runner_unavailable');
    refresh();
    return { status: 'runner_unavailable' };
  }

  const job = await getUserJob(user.id, created.jobId);

  // 사이드바 초안 목록(새 초안, 최근 수정순)이 바뀌도록 현재 화면을 다시 렌더링
  refresh();

  return job
    ? {
        status: 'started',
        draftId: created.draftId,
        isNewDraft: !request.draftId,
        job,
      }
    : { status: 'not_found' };
}

// 상태 조회가 알려주는 이번 주 남은 사용량 (resetsAt 은 ISO)
export interface GenerationQuota {
  remaining: number;
  resetsAt: string;
}

export type GenerationStatusResult =
  | {
      status: 'ok';
      job: GenerationJobView;
      // 종료된 작업일 때만 남은 사용량 (정책이 없거나 진행 중이면 null)
      quota: GenerationQuota | null;
      // 완료한 빈칸 채우기 결과: 빈칸 자리에 넣을 문단 (그 밖의 작업은 null)
      fillParagraphs: JSONContent[] | null;
    }
  | { status: 'not_found' };

/**
 * 작업 상태 조회 (Realtime 신호를 받거나 주기적으로 호출)
 * - 시간 제한을 넘긴 작업은 timeout 으로 실패 처리
 * - 완료한 초안 작성 결과는 여기서 초안에 한 번만 반영한 뒤 applied 로 돌려줌
 * - 완료한 빈칸 채우기 결과는 반영하지 않고 문단으로 돌려줌: 열려 있는 편집기가 그 빈칸만 바꾼 뒤
 *   markFillApplied 를 부름 (화면이 닫혀 있으면 다음에 초안을 열 때 서버가 반영)
 * - 실패한 빈칸 채우기는 본문 스냅숏(blank_context)을 지움
 */
export async function getGenerationStatus(
  jobId: string,
): Promise<GenerationStatusResult> {
  const { user } = await requireSession();
  const owned = typeof jobId === 'string' && (await getUserJob(user.id, jobId));

  if (!owned) {
    return { status: 'not_found' };
  }

  await expireStaleJobs({ jobId });

  if (
    owned.kind === 'draft' &&
    owned.status === 'completed' &&
    !owned.applied
  ) {
    await applyCompletedJob(jobId);
  }

  let job = await getUserJob(user.id, jobId);

  if (!job) {
    return { status: 'not_found' };
  }

  let fillParagraphs: JSONContent[] | null = null;

  if (job.kind === 'fill' && job.status === 'completed') {
    fillParagraphs = await getFillJobParagraphs(jobId);

    // 넣을 문단이 없으면 invalid_result 로 실패 처리됐으므로 다시 읽음
    if (!fillParagraphs) {
      job = (await getUserJob(user.id, jobId)) ?? job;
    }
  }

  if (job.kind === 'fill' && job.status === 'failed') {
    await clearFailedFillContexts({ jobId });
  }

  const isTerminal = job.status === 'completed' || job.status === 'failed';
  const summary = isTerminal ? await getUserQuota(user.id) : null;

  return {
    status: 'ok',
    job,
    quota: summary
      ? {
          remaining: summary.remaining,
          resetsAt: summary.resetsAt.toISOString(),
        }
      : null,
    fillParagraphs,
  };
}

export interface RequestBlankFillInput {
  repositoryId: string;
  draftId: string;
  // 다듬을 빈칸 id (UUID)
  blankId: string;
  // 빈칸에 적은 글쓴이 답 (1~1,000자)
  answer: string;
}

export type RequestBlankFillResult =
  | { status: 'started'; job: GenerationJobView }
  | {
      status:
        | 'busy'
        | 'rate_limited'
        | 'invalid'
        | 'not_found'
        | 'github_reauth'
        | 'runner_unavailable'
        | 'quota_unavailable';
    }
  | { status: 'quota_exhausted'; resetsAt: string }
  // 저장된 본문에 그 id 의 빈칸이 없음
  | { status: 'blank_missing' };

interface FillJobValues {
  options: PromptOptions;
  locale: Locale;
  question: string;
  context: string;
}

/**
 * 빈칸 채우기 작업에 넣을 값 (저장된 본문 기준, 빈칸이 없으면 null)
 * - 본문은 빈칸 id 를 정리한 뒤 찾음 (서버 반영도 같은 정리 후 바꿈)
 * - 옵션과 로케일은 그 초안의 최근 초안 작성 작업에서 복사 (없으면 기본 옵션, 요청 화면 로케일)
 */
const prepareFillJob = async (
  request: BlankFillRequest,
  requestLocale: Locale,
): Promise<FillJobValues | null> => {
  const [stored] = await db
    .select({ content: draft.content })
    .from(draft)
    .where(eq(draft.id, request.draftId))
    .limit(1);

  if (!stored || !isDraftDocument(stored.content)) {
    return null;
  }

  const content = ensureBlankIds(stored.content);
  const target = findBlank(content, request.blankId);

  if (!target) {
    return null;
  }

  const latest = await getLatestDraftJobOptions(request.draftId);
  const locale =
    latest && isLocale(latest.locale) ? latest.locale : requestLocale;
  const defaultQuestions = getDefaultBlankQuestions(locale);
  const getQuestion = (attrs: Record<string, unknown> | undefined) =>
    getBlankQuestion(attrs, defaultQuestions);
  const context = buildBlankContext(content, request.blankId, {
    locale,
    getQuestion,
  });

  if (context === null) {
    return null;
  }

  return {
    options: parsePromptOptions(latest) ?? DEFAULT_PROMPT_OPTIONS,
    locale,
    question: getQuestion(target),
    context,
  };
};

/**
 * 빈칸 채우기 작업(queued) 저장 후 작업 id 반환
 * - 답은 prompt 와 blank_answer 에 함께 저장, 커밋과 참고 링크는 비움
 * - 같은 초안에 진행 중인 작업(종류 무관)이 있으면 유일 인덱스에 걸려 null
 */
const createFillJob = async (
  userId: string,
  request: BlankFillRequest,
  values: FillJobValues,
) => {
  const jobId = crypto.randomUUID();

  try {
    await db.insert(draftPrompt).values({
      id: jobId,
      userId,
      draftId: request.draftId,
      kind: 'fill',
      prompt: request.answer,
      blankId: request.blankId,
      blankQuestion: values.question,
      blankAnswer: request.answer,
      blankContext: values.context,
      tone: values.options.tone,
      postType: values.options.postType,
      length: values.options.length,
      requiredBlocks: values.options.requiredBlocks,
      commitShas: [],
      referenceUrls: [],
      locale: values.locale,
    });
  } catch (error) {
    if (isActiveJobConflict(error)) {
      return null;
    }

    throw error;
  }

  return jobId;
};

/**
 * 빈칸 하나를 AI 로 다듬는 요청
 * 1. 세션, 입력(빈칸 id 형식, 답 길이), 저장소/초안 소유
 * 2. 초안 작성과 같은 사용자 단위 검사 (시간당 요청 수, 시간 초과 정리, 주간 할당량, GitHub 토큰)
 * 3. 저장된 본문에 그 빈칸이 있는지 (화면은 자동 저장을 마친 뒤 요청)
 * 4. 작업을 queued 로 저장 (진행 중 작업이 있으면 busy) → 실행기 시작, 시작하지 못하면 실패 처리
 * - 편집기 전체를 잠그지 않으므로 화면을 다시 렌더링하지 않음
 */
export async function requestBlankFill(
  input: RequestBlankFillInput,
): Promise<RequestBlankFillResult> {
  const { user } = await requireSession();
  const request = parseBlankFillRequest(input);

  if (!request) {
    return { status: 'invalid' };
  }

  const repository = await getStudioRepository(user.id, request.repositoryId);

  if (
    !repository ||
    !(await isOwnedDraft(user.id, repository.id, request.draftId))
  ) {
    return { status: 'not_found' };
  }

  const gate = await checkGenerationGate(user.id);

  if (gate.status !== 'ok') {
    return gate;
  }

  // 시간 초과된 작업을 먼저 정리해야 새 작업을 받을 수 있음
  await syncDraftJobs(request.draftId);

  const values = await prepareFillJob(request, await getRequestLocale());

  if (!values) {
    return { status: 'blank_missing' };
  }

  const jobId = await createFillJob(user.id, request, values);

  if (!jobId) {
    return { status: 'busy' };
  }

  try {
    await getGenerationRunner().start({
      jobId,
      githubToken: gate.githubToken,
    });
  } catch {
    await failJob(jobId, 'runner_unavailable');
    return { status: 'runner_unavailable' };
  }

  const job = await getUserJob(user.id, jobId);

  return job ? { status: 'started', job } : { status: 'not_found' };
}

export type MarkFillAppliedResult =
  | { status: 'applied' }
  // 서버(초안을 다시 열 때)나 다른 화면이 먼저 반영 표시를 남김
  | { status: 'already_applied' }
  | { status: 'not_found' };

/**
 * 편집기가 빈칸 채우기 결과를 그 빈칸에 직접 넣은 뒤 반영 표시 (본인 초안의 완료한 빈칸 채우기 작업만)
 * - applied_at 이 비어 있을 때만 남겨, 서버가 같은 결과를 다시 반영하지 않게 함
 */
export async function markFillApplied(
  jobId: string,
): Promise<MarkFillAppliedResult> {
  const { user } = await requireSession();
  const owned = typeof jobId === 'string' && (await getUserJob(user.id, jobId));

  if (!owned || owned.kind !== 'fill' || owned.status !== 'completed') {
    return { status: 'not_found' };
  }

  return (await claimFillJob(jobId))
    ? { status: 'applied' }
    : { status: 'already_applied' };
}
