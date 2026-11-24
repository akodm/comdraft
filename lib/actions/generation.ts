'use server';

import type { JSONContent } from '@tiptap/core';
import { eq } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { draft, draftPrompt } from '@/lib/db/schema';
import {
  buildBlankContext,
  getBlankQuestion,
  parseBlankFillRequest,
  type BlankFillRequest,
} from '@/lib/generation/blank-fill';
import { parseClarificationAnswers } from '@/lib/generation/clarification';
import {
  checkResumeCodeInputs,
  codeInputsField,
  parseCodeInputs,
} from '@/lib/generation/code-input';
import { getDefaultBlankQuestions } from '@/lib/generation/blank-questions';
import {
  checkGenerationBlock,
  checkGenerationGate,
  createDraftJob,
  type CreateJobResult,
  type ParsedRequest,
  type SlotRejection,
} from '@/lib/generation/draft-job';
import { getGenerationRunner } from '@/lib/generation/get-runner';
import {
  applyCompletedJob,
  cancelAwaitingJob,
  claimFillJob,
  clearFailedFillContexts,
  expireStaleJobs,
  failJob,
  getFillJobParagraphs,
  getLatestDraftJobOptions,
  getUserJob,
  isActiveJobConflict,
  requeueAwaitingJob,
  reserveGenerationSlot,
  syncDraftJobs,
  type GenerationJobView,
} from '@/lib/generation/jobs';
import {
  MAX_GENERATION_COMMITS,
  MAX_GENERATION_PROMPT_LENGTH,
} from '@/lib/generation/limits';
import { clampModel, isModelAllowed } from '@/lib/generation/models';
import { getUserQuota } from '@/lib/generation/quota-queries';
import type { GenerationBlock } from '@/lib/generation/service-block';
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
  // 선택한 커밋 SHA (최신순, 직접 입력 코드가 있으면 비어도 됨)
  commitShas: string[];
  // 직접 입력 코드 (저장하지 않고 작성기에만 넘김)
  codeInputs?: unknown;
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
  // 시간당 요청 수를 넘음 / 동시에 진행 중인 작업이 한도(MAX_ACTIVE_GENERATIONS)만큼 있음
  | { status: SlotRejection }
  // 이번 주 사용량을 모두 사용함 (resetsAt 은 ISO)
  | { status: 'quota_exhausted'; resetsAt: string }
  // 등급의 할당량 정책이 없어 확인할 수 없음
  | { status: 'quota_unavailable' }
  // 어드민이 AI 작성을 중지함 / 이용이 제한된 사용자
  | { status: GenerationBlock }
  | { status: 'invalid' }
  // 지금 등급에서 쓸 수 없는 모델
  | { status: 'model_locked' }
  | { status: 'not_found' }
  | { status: 'github_reauth' }
  // 작성기를 시작하지 못함 (작업은 실패 처리되어 잠금 해제)
  | { status: 'runner_unavailable' };

const SHA_PATTERN = /^[0-9a-f]{40}$/;

// 요청 값 검증 (형식이 맞지 않거나 제한을 넘으면 null)
const parseRequest = (
  input: RequestDraftGenerationInput,
): ParsedRequest | null => {
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const options = parsePromptOptions(input.options);
  const referenceUrls = parseReferenceUrls(input.referenceLinks);
  const draftId = typeof input.draftId === 'string' ? input.draftId : null;
  const commitShas = Array.isArray(input.commitShas) ? input.commitShas : null;
  const codeInputs = parseCodeInputs(input.codeInputs);

  if (
    !prompt ||
    prompt.length > MAX_GENERATION_PROMPT_LENGTH ||
    !options ||
    !referenceUrls ||
    !commitShas ||
    !codeInputs ||
    // 커밋이나 직접 입력 코드 중 하나는 있어야 함
    commitShas.length + codeInputs.length === 0 ||
    commitShas.length > MAX_GENERATION_COMMITS ||
    !commitShas.every((sha) => typeof sha === 'string' && SHA_PATTERN.test(sha))
  ) {
    return null;
  }

  return {
    prompt,
    options,
    commitShas: [...new Set(commitShas)],
    codeInputs,
    referenceUrls,
    draftId,
  };
};

/**
 * AI 작성 요청
 * 1. 세션, 저장소/초안 소유, 입력 제한, 사용자 단위 검사(checkGenerationGate)
 * 2. 시간당 요청 수·동시 진행 수를 확인하고 (새 초안이면 초안을 만들고) 작업을 queued 로 저장
 *    → 한도에 걸리면 rate_limited·too_many_active, 이 초안에 진행 중 작업이 있으면 busy
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

  // 작업이나 사용량 검사보다 먼저 등급의 허용 모델 확인
  if (!isModelAllowed(user.role, request.options.model)) {
    return { status: 'model_locked' };
  }

  const repository = await getStudioRepository(user.id, input.repositoryId);

  if (
    !repository ||
    (request.draftId &&
      !(await isOwnedDraft(user.id, repository.id, request.draftId)))
  ) {
    return { status: 'not_found' };
  }

  const gate = await checkGenerationGate(user, await headers());

  if (gate.status !== 'ok') {
    return gate;
  }

  if (request.draftId) {
    // 시간 초과된 작업을 먼저 정리해야 새 작업을 받을 수 있음
    await syncDraftJobs(request.draftId);
  }

  // 요청한 화면의 언어로 프롬프트를 보내고 글을 작성
  const created = await createDraftJob(
    user.id,
    repository.id,
    { ...request, source: 'studio', triggerSha: null },
    await getRequestLocale(),
  );

  // 스튜디오 요청은 트리거 SHA 가 없어 duplicate 가 될 수 없음 (있다면 진행 중 충돌과 같이 busy)
  if (created.status === 'duplicate') {
    return { status: 'busy' };
  }

  if (created.status !== 'created') {
    return created;
  }

  try {
    await getGenerationRunner().start({
      jobId: created.jobId,
      githubToken: gate.githubToken,
      ...codeInputsField(request.codeInputs),
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
        | SlotRejection
        | 'invalid'
        | 'not_found'
        | 'github_reauth'
        | 'runner_unavailable'
        | 'quota_unavailable'
        | GenerationBlock;
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
 * - 모델은 지금 등급에서 쓸 수 있는 가장 높은 모델로 낮춰 복사
 */
const prepareFillJob = async (
  request: BlankFillRequest,
  requestLocale: Locale,
  role: string | null | undefined,
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

  const options = parsePromptOptions(latest) ?? DEFAULT_PROMPT_OPTIONS;

  return {
    options: { ...options, model: clampModel(role, options.model) },
    locale,
    question: getQuestion(target),
    context,
  };
};

/**
 * 빈칸 채우기 작업(queued) 저장 후 작업 id 반환
 * - 초안 작성과 같이 한 트랜잭션에서 사용자 잠금을 잡고 시간당 요청 수·동시 진행 수를 센 뒤 INSERT
 * - 답은 prompt 와 blank_answer 에 함께 저장, 커밋과 참고 링크는 비움
 * - 같은 초안에 진행 중인 작업(종류 무관)이 있으면 유일 인덱스에 걸려 busy
 */
const createFillJob = async (
  userId: string,
  request: BlankFillRequest,
  values: FillJobValues,
): Promise<CreateJobResult<{ jobId: string }>> => {
  const jobId = crypto.randomUUID();

  try {
    const slot = await db.transaction(async (tx) => {
      const reserved = await reserveGenerationSlot(tx, userId);

      if (reserved !== 'ok') {
        return reserved;
      }

      await tx.insert(draftPrompt).values({
        id: jobId,
        userId,
        draftId: request.draftId,
        // 빈칸 채우기도 저장소의 내역에 속함
        repositoryId: request.repositoryId,
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
        model: values.options.model,
        commitShas: [],
        referenceUrls: [],
        locale: values.locale,
      });

      return reserved;
    });

    if (slot !== 'ok') {
      return { status: slot };
    }
  } catch (error) {
    if (isActiveJobConflict(error)) {
      return { status: 'busy' };
    }

    throw error;
  }

  return { status: 'created', jobId };
};

/**
 * 빈칸 하나를 AI 로 다듬는 요청
 * 1. 세션, 입력(빈칸 id 형식, 답 길이), 저장소/초안 소유
 * 2. 초안 작성과 같은 사용자 단위 검사 (시간 초과 정리, 주간 할당량, GitHub 토큰)
 * 3. 저장된 본문에 그 빈칸이 있는지 (화면은 자동 저장을 마친 뒤 요청)
 * 4. 시간당 요청 수·동시 진행 수를 확인하고 작업을 queued 로 저장 (한도면 rate_limited·too_many_active,
 *    진행 중 작업이 있으면 busy) → 실행기 시작, 시작하지 못하면 실패 처리
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

  const gate = await checkGenerationGate(user, await headers());

  if (gate.status !== 'ok') {
    return gate;
  }

  // 시간 초과된 작업을 먼저 정리해야 새 작업을 받을 수 있음
  await syncDraftJobs(request.draftId);

  const values = await prepareFillJob(
    request,
    await getRequestLocale(),
    user.role,
  );

  if (!values) {
    return { status: 'blank_missing' };
  }

  const created = await createFillJob(user.id, request, values);

  if (created.status !== 'created') {
    return created;
  }

  const { jobId } = created;

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

export interface ResumeClarifiedJobInput {
  jobId: string;
  // 'skipped'(그냥 작성) 이거나 질문 id 별 답 배열
  answers: unknown;
  // 처음 요청에 넣은 직접 입력 코드 (화면이 들고 있던 사본이나 다시 넣은 코드)
  codeInputs?: unknown;
}

export type ResumeClarifiedJobResult =
  | { status: 'started'; job: GenerationJobView }
  | { status: 'invalid' | 'github_reauth' }
  // AI 작성 중지 / 이용 제한 사용자 (작업은 답변 대기 그대로)
  | { status: GenerationBlock }
  // 처음 넣은 직접 입력 코드가 없거나 달라 다시 넣어야 함 (작업은 답변 대기 그대로)
  | { status: 'code_required'; job: GenerationJobView }
  // 동시에 진행 중인 작업이 한도(MAX_ACTIVE_GENERATIONS)만큼 있음 (작업은 답변 대기 그대로)
  | { status: 'too_many_active' }
  // job: 지금 서버가 아는 작업 (화면이 낡은 답변 대기 상태에서 벗어나도록, 없거나 내 것이 아니면 null)
  | {
      status: 'not_found' | 'runner_unavailable';
      job: GenerationJobView | null;
    };

/**
 * 되묻기에 답하거나 건너뛰고 작업을 다시 실행
 * 1. 세션, 내 초안 작성 작업이 답변 대기인지
 * 2. AI 작성 중지·사용자 밴 (작업 상태는 바꾸지 않고 거부, 재개하면 다시 답할 수 있음)
 * 3. 답 검증 (저장된 질문 기준, 건너뛰면 생략)
 * 4. GitHub 토큰
 * 5. 멈춘 작업 시간 초과 처리 후, 사용자 잠금 안에서 진행 중 작업 수를 세고 답변 대기 → queued
 *    (진행 중이 한도면 too_many_active, 다른 탭이 먼저 처리했으면 not_found, 실행기를 두 번 부르지 않음)
 * 6. 작성기 시작, 시작하지 못하면 실패 처리
 * - 시간당 요청 수와 주간 할당량은 검사하지 않음: 새 요청이 아니고 사용량은 Lambda 가 예약할 때 검사
 */
export async function resumeClarifiedJob(
  input: ResumeClarifiedJobInput,
): Promise<ResumeClarifiedJobResult> {
  const { user } = await requireSession();
  const jobId = typeof input?.jobId === 'string' ? input.jobId : null;
  const owned = jobId ? await getUserJob(user.id, jobId) : null;

  if (
    !jobId ||
    !owned ||
    owned.kind !== 'draft' ||
    owned.status !== 'awaiting_input'
  ) {
    return {
      status: 'not_found',
      job: owned?.kind === 'draft' ? owned : null,
    };
  }

  const block = await checkGenerationBlock(user);

  if (block) {
    return { status: block };
  }

  let answers: ReturnType<typeof parseClarificationAnswers> | 'skipped';

  if (input.answers === 'skipped') {
    answers = 'skipped';
  } else {
    answers = parseClarificationAnswers(
      input.answers,
      owned.clarification?.questions ?? [],
    );
  }

  if (!answers) {
    return { status: 'invalid' };
  }

  // 코드는 저장하지 않으므로 재실행에 쓸 코드를 화면이 다시 보내야 함 (그냥 작성도 같음)
  const code = checkResumeCodeInputs(owned.codeInputs, input.codeInputs);

  if (code.status === 'code_required') {
    return { status: 'code_required', job: owned };
  }

  let githubToken: string;

  try {
    githubToken = await getGithubUserToken(user.id, await headers());
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return { status: 'github_reauth' };
    }

    throw error;
  }

  // 멈춘 작업이 진행 중으로 세지지 않도록 먼저 시간 초과 처리
  await expireStaleJobs({ userId: user.id });

  const requeued = await requeueAwaitingJob(jobId, user.id, answers);

  if (requeued === 'too_many_active') {
    return { status: 'too_many_active' };
  }

  if (requeued === 'not_found') {
    return {
      status: 'not_found',
      job: await getUserJob(user.id, jobId),
    };
  }

  try {
    await getGenerationRunner().start({
      jobId,
      githubToken,
      ...codeInputsField(code.inputs),
    });
  } catch {
    await failJob(jobId, 'runner_unavailable');
    refresh();
    return {
      status: 'runner_unavailable',
      job: await getUserJob(user.id, jobId),
    };
  }

  // 목록의 답변 대기 표시를 지움
  refresh();

  const job = await getUserJob(user.id, jobId);

  return job ? { status: 'started', job } : { status: 'not_found', job: null };
}

/**
 * 되묻기 중인 작업을 취소 (내 초안 작성 작업의 답변 대기만, 잠금 해제)
 */
export async function cancelClarifiedJob(
  jobId: string,
): Promise<{ status: 'cancelled' | 'not_found' }> {
  const { user } = await requireSession();
  const owned = typeof jobId === 'string' && (await getUserJob(user.id, jobId));

  if (!owned || owned.kind !== 'draft' || !(await cancelAwaitingJob(jobId))) {
    return { status: 'not_found' };
  }

  refresh();

  return { status: 'cancelled' };
}
