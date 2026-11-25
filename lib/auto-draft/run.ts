import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { computeAutoDraftBatch } from '@/lib/auto-draft/batch-server';
import { compareBranch, findEmptyCommits } from '@/lib/auto-draft/github';
import {
  findConsumedShas,
  listExcludedShas,
  moveBoundary,
  type PushTarget,
} from '@/lib/auto-draft/store';
import { mergeTriggerOptions } from '@/lib/auto-draft/trigger';
import type { TriggerPush } from '@/lib/auto-draft/webhook';
import { db } from '@/lib/db';
import { draftPrompt } from '@/lib/db/schema';
import type { GenerationErrorCode } from '@/lib/generation/contract';
import {
  checkGenerationGate,
  createDraftJob,
  type CreateDraftJobResult,
  type DraftJobRequest,
  type GenerationGateResult,
} from '@/lib/generation/draft-job';
import { getGenerationRunner } from '@/lib/generation/get-runner';
import { failJob, isTriggerDuplicateConflict } from '@/lib/generation/jobs';
import { isModelAllowed } from '@/lib/generation/models';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n/config';
import type { PromptOptions } from '@/lib/studio/options';

/**
 * 커밋 트리거 자동 초안 실행 (웹훅이 after() 안에서 호출)
 * - 순서: 프리셋 → gate → 모델 → 묶음(경계...푸시 끝) → 경계 선점(끝까지 봤을 때만) → 작업 생성 → 실행기 시작
 * - 트리거는 웹훅이 고른 푸시의 가장 최신 [comdraft] 커밋 (PR·머지·squash 커밋 포함), 옵션과 trigger_sha 로 씀
 * - 끝까지 봤으면 작업을 만들기 전에 경계를 푸시 끝으로 먼저 옮겨(선점) 다른 트리거가 같은 커밋을 쓰지 않게 함
 *   → 작업을 만들지 못하거나 실행기를 시작하지 못하면 원래 경계로 되돌림
 * - 20개에서 잘렸으면 경계를 옮기지 않음 (쓴 커밋은 consumed 로 다음 계산에서 빠짐)
 * - 시작 전에 막힌 경우는 초안 없이 실패 행(draft_prompt)만 남김 (커밋 메시지는 저장하지 않음)
 */

export type RunOutcome =
  | { status: 'started'; jobId: string }
  | { status: 'skipped'; errorCode: GenerationErrorCode }
  | { status: 'duplicate' };

// 초안 없이 남기는 실패 행 입력 (commitShas 는 비워 둠: 시작 전에 막힌 요청이라 쓰인 커밋이 없음)
export interface FailureRecord {
  userId: string;
  repositoryId: string;
  triggerSha: string;
  errorCode: GenerationErrorCode;
  prompt: string;
  options: PromptOptions;
  locale: Locale;
}

export interface RunDeps {
  compare: typeof compareBranch;
  findEmptyCommits: typeof findEmptyCommits;
  findConsumedShas: typeof findConsumedShas;
  listExcludedShas: typeof listExcludedShas;
  gate: (
    user: PushTarget['user'],
    headers: Headers | null,
  ) => Promise<GenerationGateResult>;
  createDraftJob: (
    userId: string,
    repositoryId: string,
    request: DraftJobRequest,
    locale: Locale,
  ) => Promise<CreateDraftJobResult>;
  startRunner: (request: {
    jobId: string;
    githubToken: string;
  }) => Promise<void>;
  failJob: (jobId: string, errorCode: GenerationErrorCode) => Promise<unknown>;
  recordFailure: (record: FailureRecord) => Promise<'recorded' | 'duplicate'>;
  moveBoundary: typeof moveBoundary;
  getLocale: (userId: string) => Promise<Locale>;
}

// 사용자의 가장 최근 요청 로케일 (없거나 알 수 없으면 기본값)
const getLatestLocale = async (userId: string): Promise<Locale> => {
  const [row] = await db
    .select({ locale: draftPrompt.locale })
    .from(draftPrompt)
    .where(eq(draftPrompt.userId, userId))
    .orderBy(desc(draftPrompt.createdAt))
    .limit(1);

  return isLocale(row?.locale) ? row.locale : DEFAULT_LOCALE;
};

// 실패 행 INSERT (같은 트리거 SHA 가 이미 있으면 duplicate)
const insertFailure = async (
  record: FailureRecord,
): Promise<'recorded' | 'duplicate'> => {
  try {
    await db.insert(draftPrompt).values({
      id: crypto.randomUUID(),
      userId: record.userId,
      draftId: null,
      repositoryId: record.repositoryId,
      kind: 'draft',
      source: 'commit_trigger',
      triggerSha: record.triggerSha,
      prompt: record.prompt,
      tone: record.options.tone,
      postType: record.options.postType,
      length: record.options.length,
      requiredBlocks: record.options.requiredBlocks,
      model: record.options.model,
      commitShas: [],
      locale: record.locale,
      status: 'failed',
      errorCode: record.errorCode,
      finishedAt: new Date(),
    });

    return 'recorded';
  } catch (error) {
    if (isTriggerDuplicateConflict(error)) return 'duplicate';

    throw error;
  }
};

export const defaultRunDeps: RunDeps = {
  compare: (repo, base, head) => compareBranch(repo, base, head),
  findEmptyCommits: (repo, shas) => findEmptyCommits(repo, shas),
  findConsumedShas: (userId, repositoryId, shas) =>
    findConsumedShas(userId, repositoryId, shas),
  listExcludedShas: (userId, repositoryId) =>
    listExcludedShas(userId, repositoryId),
  gate: (user, headers) => checkGenerationGate(user, headers),
  createDraftJob: (userId, repositoryId, request, locale) =>
    createDraftJob(userId, repositoryId, request, locale),
  startRunner: (request) => getGenerationRunner().start(request),
  failJob: (jobId, errorCode) => failJob(jobId, errorCode),
  recordFailure: insertFailure,
  moveBoundary: (userId, repositoryId, from, to) =>
    moveBoundary(userId, repositoryId, from, to),
  getLocale: getLatestLocale,
};

// gate 거부 상태 → 실패 코드 (quota_exhausted 만 이름이 다름)
const gateErrorCode = (
  status: Exclude<GenerationGateResult['status'], 'ok'>,
): GenerationErrorCode => {
  return status === 'quota_exhausted' ? 'quota_exceeded' : status;
};

// 작업 만들기 거부 상태 → 실패 코드 (busy 는 코드가 없어 too_many_active)
const slotErrorCode = (
  status: 'busy' | 'rate_limited' | 'too_many_active',
): GenerationErrorCode => {
  return status === 'busy' ? 'too_many_active' : status;
};

/**
 * 실행 중 예상 밖 오류가 났을 때 internal 실패 행을 남김 (웹훅 after() 에서 호출)
 * - 같은 트리거 SHA 의 행(작업 행이나 실패 행)이 이미 있으면 그대로 둠
 */
export async function recordUnexpectedFailure(
  target: PushTarget,
  push: TriggerPush,
  deps: Pick<RunDeps, 'getLocale' | 'recordFailure'> = defaultRunDeps,
): Promise<void> {
  const { userId, repositoryId, setting } = target;

  await deps.recordFailure({
    userId,
    repositoryId,
    triggerSha: push.trigger.sha,
    errorCode: 'internal',
    prompt: setting.prompt,
    options: mergeTriggerOptions(setting.options, push.trigger.options),
    locale: await deps.getLocale(userId),
  });
}

export async function runAutoDraft(
  target: PushTarget,
  push: TriggerPush,
  deps: RunDeps = defaultRunDeps,
): Promise<RunOutcome> {
  const { userId, repositoryId, setting } = target;
  const { trigger } = push;
  const triggerSha = trigger.sha;
  const options = mergeTriggerOptions(setting.options, trigger.options);
  const locale = await deps.getLocale(userId);

  // 시작 전 실패: 행을 남기고 결과로 변환
  const skip = async (errorCode: GenerationErrorCode): Promise<RunOutcome> => {
    const recorded = await deps.recordFailure({
      userId,
      repositoryId,
      triggerSha,
      errorCode,
      prompt: setting.prompt,
      options,
      locale,
    });

    return recorded === 'duplicate'
      ? { status: 'duplicate' }
      : { status: 'skipped', errorCode };
  };

  if (setting.prompt.trim() === '') return skip('no_preset');
  // 경계가 없으면 범위를 알 수 없으므로 "제한 없음" 으로 보지 않음
  if (setting.boundarySha === null) return skip('anchor_missing');

  const gate = await deps.gate(target.user, null);
  if (gate.status !== 'ok') return skip(gateErrorCode(gate.status));

  // 모델은 커밋 옵션으로 바꿀 수 없음
  if (!isModelAllowed(target.user.role, setting.options.model)) {
    return skip('model_locked');
  }

  const boundary = setting.boundarySha;
  const excluded = await deps.listExcludedShas(userId, repositoryId);
  const plan = await computeAutoDraftBatch(
    target.repo,
    {
      userId,
      repositoryId,
      boundarySha: boundary,
      endSha: push.headSha,
      excluded,
    },
    deps,
  );
  if (plan.status !== 'ok') return skip(plan.status);

  // 웹훅 재전송이면 경계가 이미 푸시 끝이라 여기서 끝남 (작업 행과 trigger_sha 가 겹쳐 duplicate)
  const { batchShas } = plan;
  if (batchShas.length === 0) return skip('no_commits');

  // 끝까지 봤을 때만 경계를 푸시 끝으로 선점 (건너뛴 커밋도 다시 보지 않음)
  // 20개에서 잘렸으면 경계는 그대로 → 남은 커밋은 다음 묶음, 쓴 커밋은 consumed 로 빠짐
  const claimTo = plan.exhausted ? push.headSha : null;

  if (claimTo !== null) {
    // 다른 트리거가 먼저 경계를 옮겼으면 이 묶음은 이미 그쪽 몫
    const claimed = await deps.moveBoundary(
      userId,
      repositoryId,
      boundary,
      claimTo,
    );
    if (!claimed) return skip('no_commits');
  }

  // 선점했을 때만 되돌림 (선점하지 않았으면 경계를 건드리지 않음)
  const revert = async () => {
    if (claimTo !== null) {
      await deps.moveBoundary(userId, repositoryId, claimTo, boundary);
    }
  };

  let created: CreateDraftJobResult;
  try {
    created = await deps.createDraftJob(
      userId,
      repositoryId,
      {
        prompt: setting.prompt,
        options,
        // 최신순
        commitShas: [...batchShas].reverse(),
        codeInputs: [],
        referenceUrls: [],
        draftId: null,
        source: 'commit_trigger',
        triggerSha,
      },
      locale,
    );
  } catch (error) {
    // 되돌리기가 실패해도 원래 오류를 던짐
    await revert().catch(() => undefined);
    throw error;
  }

  if (created.status !== 'created') {
    await revert();

    return created.status === 'duplicate'
      ? { status: 'duplicate' }
      : skip(slotErrorCode(created.status));
  }

  try {
    await deps.startRunner({
      jobId: created.jobId,
      githubToken: gate.githubToken,
    });
  } catch {
    // 작업 행이 이미 있으므로 실패 행을 따로 남기지 않음
    // 경계를 먼저 되돌려 failJob 이 실패해도 항상 복구
    await revert();
    await deps.failJob(created.jobId, 'runner_unavailable');

    return { status: 'skipped', errorCode: 'runner_unavailable' };
  }

  return { status: 'started', jobId: created.jobId };
}
