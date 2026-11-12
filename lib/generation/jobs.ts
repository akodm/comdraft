import 'server-only';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { JSONContent } from '@tiptap/core';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { draft, draftPrompt } from '@/lib/db/schema';
import { fillResultToParagraphs } from '@/lib/generation/blank-fill';
import type {
  GenerationClarificationAnswer,
  GenerationClarificationQuestion,
  GenerationErrorCode,
  GenerationJobKind,
  GenerationStatus,
  GenerationStep,
} from '@/lib/generation/contract';
import { isGenerationErrorCode } from '@/lib/generation/contract';
import { parseStoredClarification } from '@/lib/generation/clarification';
import { getStaleCutoffs } from '@/lib/generation/job-state';
import { markdownToDraftDocument } from '@/lib/generation/markdown';
import {
  markImagesUsed,
  scheduleDraftImageCleanup,
} from '@/lib/images/cleanup';
import { parseImagePath, removeDisallowedImages } from '@/lib/images/rules';
import { ensureBlankIds, replaceBlank } from '@/lib/studio/draft-blank';
import { extractDraftTitle, isDraftDocument } from '@/lib/studio/draft-content';
import { getSupabaseUrl } from '@/lib/supabase/server';

/**
 * AI 작성 작업(draft_prompt) 저장소
 * - 상태 전이는 조건부 UPDATE 로만 (이미 끝난 작업을 다시 바꾸지 않음)
 */

/**
 * 본문이 바뀔 때의 초안 상태 SQL: 게시 중이던 초안은 '임시'로, 나머지는 그대로
 * - 자동 저장과 AI 결과 반영이 같은 규칙을 쓰도록 한곳에 둠
 */
export const draftStatusAfterContentChange = () =>
  sql`case when ${draft.status} = 'published' then 'temporary' else ${draft.status} end`;

// 화면에 전달하는 작업 상태 (결과 본문, 요청 문구 제외)
export interface GenerationJobView {
  id: string;
  // 작업 종류 (fill 은 편집기 전체가 아니라 blankId 의 빈칸만 막음)
  kind: GenerationJobKind;
  // 빈칸 채우기 대상 빈칸 id (초안 작성 작업은 null)
  blankId: string | null;
  channel: string;
  status: GenerationStatus;
  step: GenerationStep;
  errorCode: GenerationErrorCode | null;
  // 결과를 초안에 반영했는지 (초안 작성: 완료 + 미반영이면 편집 잠금)
  applied: boolean;
  finishedAt: string | null;
  // 답변 대기(awaiting_input) 중일 때의 질문 (답은 넣지 않음, 그 밖의 상태는 null)
  clarification: {
    reason: string;
    questions: GenerationClarificationQuestion[];
  } | null;
}

// Lambda 가 도는 상태 (실패 처리와 시간 초과 대상)
const ACTIVE_STATUSES: GenerationStatus[] = ['queued', 'running'];

// 초안을 잠그는 상태: 답변 대기도 같은 초안의 새 작성이나 본문 수정을 막음
const LOCKING_ACTIVE_STATUSES: GenerationStatus[] = [
  ...ACTIVE_STATUSES,
  'awaiting_input',
];

const jobViewColumns = {
  id: draftPrompt.id,
  kind: draftPrompt.kind,
  blankId: draftPrompt.blankId,
  channel: draftPrompt.channel,
  status: draftPrompt.status,
  step: draftPrompt.step,
  errorCode: draftPrompt.errorCode,
  appliedAt: draftPrompt.appliedAt,
  finishedAt: draftPrompt.finishedAt,
  clarification: draftPrompt.clarification,
};

interface JobViewRow {
  id: string;
  kind: GenerationJobKind;
  blankId: string | null;
  channel: string;
  status: GenerationStatus;
  step: number;
  errorCode: string | null;
  appliedAt: Date | null;
  finishedAt: Date | null;
  clarification: unknown;
}

// 답변 대기 중인 작업의 질문 (저장된 값이 형식에 맞지 않으면 null)
const toViewClarification = (row: JobViewRow) => {
  if (row.status !== 'awaiting_input') {
    return null;
  }

  const stored = parseStoredClarification(row.clarification);

  return stored ? { reason: stored.reason, questions: stored.questions } : null;
};

const toJobView = (row: JobViewRow): GenerationJobView => ({
  id: row.id,
  kind: row.kind,
  blankId: row.kind === 'fill' ? row.blankId : null,
  channel: row.channel,
  status: row.status,
  step: Math.min(Math.max(row.step, 0), 3) as GenerationStep,
  errorCode: isGenerationErrorCode(row.errorCode) ? row.errorCode : null,
  applied: row.appliedAt !== null,
  finishedAt: row.finishedAt?.toISOString() ?? null,
  clarification: toViewClarification(row),
});

/**
 * 초안을 잠그는 작업이 있는지 (SQL 조건, 초안 id 컬럼 기준)
 * - 초안 작성 작업 중 진행 중(queued/running)이거나 답변 대기(awaiting_input)이거나 완료 후 아직 반영하지 않은 작업
 * - 빈칸 채우기 작업은 잠그지 않음 (자동 저장·게시·이미지 올리기는 그대로)
 */
export const lockingJobExists = (draftIdColumn: PgColumn): SQL => sql`exists (
  select 1 from ${draftPrompt}
  where ${draftPrompt.draftId} = ${draftIdColumn}
    and ${draftPrompt.kind} = 'draft'
    and (${draftPrompt.status} in ('queued', 'running', 'awaiting_input')
      or (${draftPrompt.status} = 'completed' and ${draftPrompt.appliedAt} is null))
)`;

type ExpireTarget =
  | { draftId: string }
  | { jobId: string }
  | { userId: string };

// 정리 대상 조건 (초안의 작업, 작업 하나, 사용자의 모든 작업)
const expireTargetCondition = (target: ExpireTarget) => {
  if ('draftId' in target) {
    return eq(draftPrompt.draftId, target.draftId);
  }

  if ('jobId' in target) {
    return eq(draftPrompt.id, target.jobId);
  }

  return eq(draftPrompt.userId, target.userId);
};

/**
 * 시간 제한을 넘긴 진행 중 작업을 timeout 으로 실패 처리 (초안, 작업 하나 또는 사용자 기준)
 * - 빈칸 채우기의 본문 스냅숏(blank_context)도 지움 (Lambda 는 queued 에서 시작할 때만 읽으므로 더 쓰지 않음)
 */
export const expireStaleJobs = async (
  target: ExpireTarget,
  now = new Date(),
) => {
  const { runningStartedBefore, queuedCreatedBefore } = getStaleCutoffs(now);

  await db
    .update(draftPrompt)
    .set({
      status: 'failed',
      errorCode: 'timeout',
      finishedAt: now,
      blankContext: null,
    })
    .where(
      and(
        expireTargetCondition(target),
        or(
          and(
            eq(draftPrompt.status, 'running'),
            // 컬럼이 아닌 식과 비교하므로 Date 를 직접 넘기지 않고 timestamptz 로 변환
            sql`coalesce(${draftPrompt.startedAt}, ${draftPrompt.createdAt}) < ${runningStartedBefore.toISOString()}::timestamptz`,
          ),
          and(
            eq(draftPrompt.status, 'queued'),
            // 다시 대기열에 넣은 작업은 started_at 부터 재서 running 과 같은 방식으로 비교
            sql`coalesce(${draftPrompt.startedAt}, ${draftPrompt.createdAt}) < ${queuedCreatedBefore.toISOString()}::timestamptz`,
          ),
        ),
      ),
    );
};

/**
 * 완료한 초안 작성 작업의 결과(Markdown)를 초안 본문에 한 번만 반영
 * - applied_at 을 먼저 선점한 요청만 반영하므로 여러 번 호출해도 결과는 한 번만 들어감
 * - 결과가 없거나 변환에 실패하면 작업을 invalid_result 로 실패 처리 (잠금 해제)
 * - 이미지는 그 초안 사용자의 공개 버킷 주소만 남김 (자동 저장과 같은 규칙)
 * - 바뀌기 전 본문과 반영한 본문에 든 이미지는 같은 트랜잭션에서 마지막 사용 시각을 갱신
 * - 반영하면 트랜잭션 밖에서(응답 뒤) 쓰지 않게 된 이미지를 정리
 * @returns 이번 호출에서 반영했는지
 */
export const applyCompletedJob = async (jobId: string) => {
  const supabaseUrl = getSupabaseUrl();
  const appliedDraftId = await db.transaction(async (tx) => {
    const now = new Date();
    const [claimed] = await tx
      .update(draftPrompt)
      .set({ appliedAt: now })
      .where(
        and(
          eq(draftPrompt.id, jobId),
          eq(draftPrompt.kind, 'draft'),
          eq(draftPrompt.status, 'completed'),
          isNull(draftPrompt.appliedAt),
        ),
      )
      .returning({ draftId: draftPrompt.draftId, result: draftPrompt.result });

    // 그 사이 초안이 삭제됐으면 반영할 곳이 없음 (작업 행은 사용량 기록으로만 남음)
    if (!claimed?.draftId) {
      return null;
    }

    // 바뀌기 전 본문도 함께 읽음 (행 잠금: 결과로 바뀌어 빠지는 이미지의 마지막 사용 시각 갱신용)
    const [owner] = await tx
      .select({ userId: draft.userId, content: draft.content })
      .from(draft)
      .where(eq(draft.id, claimed.draftId))
      .limit(1)
      .for('update');

    if (!owner) {
      return null;
    }

    let content: ReturnType<typeof markdownToDraftDocument> | null = null;

    try {
      content = claimed.result
        ? removeDisallowedImages(
            markdownToDraftDocument(claimed.result),
            (src) => parseImagePath(supabaseUrl, src, owner.userId) !== null,
          )
        : null;
    } catch {
      content = null;
    }

    if (!content) {
      await tx
        .update(draftPrompt)
        .set({ status: 'failed', errorCode: 'invalid_result' })
        .where(eq(draftPrompt.id, jobId));

      return null;
    }

    await tx
      .update(draft)
      .set({
        content,
        title: extractDraftTitle(content),
        status: draftStatusAfterContentChange(),
        updatedAt: now,
      })
      .where(eq(draft.id, claimed.draftId));

    await markImagesUsed(tx, owner.userId, [owner.content, content]);

    return claimed.draftId;
  });

  if (!appliedDraftId) {
    return false;
  }

  scheduleDraftImageCleanup(appliedDraftId);

  return true;
};

/**
 * 실패로 끝난 빈칸 채우기 작업의 본문 스냅숏(blank_context) 지우기 (초안 또는 작업 하나 기준)
 * - Lambda 가 남긴 실패(사용량 초과, LLM 오류 등)도 정리: 끝난 작업은 Lambda 가 다시 읽지 않음
 * - 질문과 답(blank_question, blank_answer)은 기록으로 남김
 */
export const clearFailedFillContexts = async (
  target: { draftId: string } | { jobId: string },
) => {
  await db
    .update(draftPrompt)
    .set({ blankContext: null })
    .where(
      and(
        expireTargetCondition(target),
        eq(draftPrompt.kind, 'fill'),
        eq(draftPrompt.status, 'failed'),
        isNotNull(draftPrompt.blankContext),
      ),
    );
};

// 반영 표시를 아직 남기지 않은 완료된 빈칸 채우기 작업 (서버 반영과 편집기 반영 표시가 같은 조건으로 선점)
const unappliedFillCondition = (jobId: string) =>
  and(
    eq(draftPrompt.id, jobId),
    eq(draftPrompt.kind, 'fill'),
    eq(draftPrompt.status, 'completed'),
    isNull(draftPrompt.appliedAt),
  );

/**
 * 완료한 빈칸 채우기 결과를 그 id 의 빈칸 자리에 한 번만 반영 (화면이 닫혀 있던 경우, 초안을 열 때)
 * - applied_at 을 먼저 선점한 요청만 반영 (편집기가 markFillApplied 로 먼저 선점했으면 아무것도 하지 않음)
 * - 선점하면서 본문 스냅숏(blank_context)을 지움 (질문과 답은 기록으로 남김)
 * - 결과에 문단이 없으면 작업을 invalid_result 로 실패 처리 (빈칸과 답은 그대로)
 * - 본문은 행 잠금으로 읽고 빈칸 id 를 정리한 뒤 그 빈칸만 바꿈 (다른 내용은 그대로)
 * - 빈칸이 사라졌으면 결과를 버리고 반영 표시만 남김
 * - 결과는 문단만이라 이미지가 늘지 않지만, 본문을 바꾸는 다른 경로와 같게 마지막 사용 시각 갱신과 정리를 함께 함
 * @returns 이번 호출에서 본문을 바꿨는지
 */
export const applyCompletedFillJob = async (jobId: string) => {
  const appliedDraftId = await db.transaction(async (tx) => {
    const now = new Date();
    const [claimed] = await tx
      .update(draftPrompt)
      .set({ appliedAt: now, blankContext: null })
      .where(unappliedFillCondition(jobId))
      .returning({
        draftId: draftPrompt.draftId,
        blankId: draftPrompt.blankId,
        result: draftPrompt.result,
      });

    if (!claimed?.draftId) {
      return null;
    }

    const paragraphs = fillResultToParagraphs(claimed.result);

    if (paragraphs.length === 0) {
      await tx
        .update(draftPrompt)
        .set({ status: 'failed', errorCode: 'invalid_result' })
        .where(eq(draftPrompt.id, jobId));

      return null;
    }

    const [owner] = await tx
      .select({ userId: draft.userId, content: draft.content })
      .from(draft)
      .where(eq(draft.id, claimed.draftId))
      .limit(1)
      .for('update');

    if (!owner || !claimed.blankId || !isDraftDocument(owner.content)) {
      return null;
    }

    const { doc: content, replaced } = replaceBlank(
      ensureBlankIds(owner.content),
      claimed.blankId,
      paragraphs,
    );

    if (!replaced) {
      return null;
    }

    await tx
      .update(draft)
      .set({
        content,
        title: extractDraftTitle(content),
        status: draftStatusAfterContentChange(),
        updatedAt: now,
      })
      .where(eq(draft.id, claimed.draftId));

    await markImagesUsed(tx, owner.userId, [owner.content, content]);

    return claimed.draftId;
  });

  if (!appliedDraftId) {
    return false;
  }

  scheduleDraftImageCleanup(appliedDraftId);

  return true;
};

/**
 * 편집기가 빈칸 채우기 결과를 직접 반영했다는 표시 (applied_at 선점, 본문 스냅숏 blank_context 는 지움)
 * @returns 이번 호출에서 선점했는지 (이미 서버나 다른 화면이 반영했으면 false)
 */
export const claimFillJob = async (jobId: string) => {
  const [row] = await db
    .update(draftPrompt)
    .set({ appliedAt: new Date(), blankContext: null })
    .where(unappliedFillCondition(jobId))
    .returning({ id: draftPrompt.id });

  return Boolean(row);
};

/**
 * 완료한 빈칸 채우기 결과 → 빈칸 자리에 넣을 문단 (편집기가 반영할 때 상태 조회로 받음)
 * - 반영 여부와 무관하게 돌려줌: 서버가 먼저 반영했어도 열려 있는 편집기에 빈칸이 남아 있으면 같은 결과를 넣음
 * - 문단이 없으면 반영 전인 작업은 invalid_result 로 실패 처리하고 null
 */
export const getFillJobParagraphs = async (
  jobId: string,
): Promise<JSONContent[] | null> => {
  const [row] = await db
    .select({ result: draftPrompt.result })
    .from(draftPrompt)
    .where(
      and(
        eq(draftPrompt.id, jobId),
        eq(draftPrompt.kind, 'fill'),
        eq(draftPrompt.status, 'completed'),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const paragraphs = fillResultToParagraphs(row.result);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  await db
    .update(draftPrompt)
    .set({ status: 'failed', errorCode: 'invalid_result', blankContext: null })
    .where(unappliedFillCondition(jobId));

  return null;
};

/**
 * 초안의 작업 상태 정리: 시간 초과 처리 후, 완료했지만 반영하지 않은 결과 반영 (만든 순서대로)
 * - 스튜디오 화면을 열 때, 초안을 바꾸는 액션 전에 호출
 * - 빈칸 채우기 결과는 applyFills 일 때만 (초안을 열 때만): 열려 있는 편집기는 상태 조회로 결과를 받아
 *   직접 반영하므로, 자동 저장·게시 전에 서버가 먼저 넣으면 곧바로 편집기 본문으로 덮이고 반영 표시만 남음
 *   초안을 열 때는 실패한 빈칸 채우기의 본문 스냅숏도 지움 (자동 저장마다 하지 않음)
 */
export const syncDraftJobs = async (
  draftId: string,
  { applyFills = false }: { applyFills?: boolean } = {},
) => {
  await expireStaleJobs({ draftId });

  const pending = await db
    .select({ id: draftPrompt.id, kind: draftPrompt.kind })
    .from(draftPrompt)
    .where(
      and(
        eq(draftPrompt.draftId, draftId),
        eq(draftPrompt.status, 'completed'),
        isNull(draftPrompt.appliedAt),
      ),
    )
    .orderBy(asc(draftPrompt.createdAt));

  for (const { id, kind } of pending) {
    if (kind === 'draft') {
      await applyCompletedJob(id);
    } else if (applyFills) {
      await applyCompletedFillJob(id);
    }
  }

  if (applyFills) {
    await clearFailedFillContexts({ draftId });
  }
};

// 초안을 바꿀 수 없는 상태인지 (정리 후 진행 중인 초안 작성 작업이 남아 있으면 잠금, 빈칸 채우기는 잠그지 않음)
export const isDraftLocked = async (draftId: string) => {
  await syncDraftJobs(draftId);

  const [active] = await db
    .select({ id: draftPrompt.id })
    .from(draftPrompt)
    .where(
      and(
        eq(draftPrompt.draftId, draftId),
        eq(draftPrompt.kind, 'draft'),
        inArray(draftPrompt.status, LOCKING_ACTIVE_STATUSES),
      ),
    )
    .limit(1);

  return Boolean(active);
};

// 초안을 잠그는 작업(진행 중 또는 반영 전 결과)이 있는지: 정리 후 `lockingJobExists` 로 확인 (본문 저장과 같은 조건)
export const isDraftEditLocked = async (draftId: string) => {
  await syncDraftJobs(draftId);

  const [locked] = await db
    .select({ id: draft.id })
    .from(draft)
    .where(and(eq(draft.id, draftId), lockingJobExists(draft.id)))
    .limit(1);

  return Boolean(locked);
};

// 초안의 가장 최근 작업 (kind 를 주면 그 종류 중에서)
export const getLatestDraftJob = async (
  draftId: string,
  kind?: GenerationJobKind,
): Promise<GenerationJobView | null> => {
  const [row] = await db
    .select(jobViewColumns)
    .from(draftPrompt)
    .where(
      and(
        eq(draftPrompt.draftId, draftId),
        kind ? eq(draftPrompt.kind, kind) : undefined,
      ),
    )
    .orderBy(desc(draftPrompt.createdAt))
    .limit(1);

  return row ? toJobView(row) : null;
};

// 초안의 최근 초안 작성 작업의 옵션과 로케일 (화면 기본 옵션, 빈칸 채우기 작업에 복사, 없으면 null)
export const getLatestDraftJobOptions = async (draftId: string) => {
  const [row] = await db
    .select({
      tone: draftPrompt.tone,
      postType: draftPrompt.postType,
      length: draftPrompt.length,
      requiredBlocks: draftPrompt.requiredBlocks,
      model: draftPrompt.model,
      locale: draftPrompt.locale,
    })
    .from(draftPrompt)
    .where(and(eq(draftPrompt.draftId, draftId), eq(draftPrompt.kind, 'draft')))
    .orderBy(desc(draftPrompt.createdAt))
    .limit(1);

  return row ?? null;
};

// 사용자 본인 초안의 작업 하나 (다른 사용자의 작업이면 null)
export const getUserJob = async (
  userId: string,
  jobId: string,
): Promise<GenerationJobView | null> => {
  const [row] = await db
    .select(jobViewColumns)
    .from(draftPrompt)
    .innerJoin(draft, eq(draftPrompt.draftId, draft.id))
    .where(and(eq(draftPrompt.id, jobId), eq(draft.userId, userId)))
    .limit(1);

  return row ? toJobView(row) : null;
};

// 사용자가 since 이후 보낸 작성 요청 수 (요청 횟수 제한, 초안을 삭제한 요청도 셈)
export const countUserJobsSince = async (userId: string, since: Date) => {
  const [{ total }] = await db
    .select({ total: count() })
    .from(draftPrompt)
    .where(
      and(eq(draftPrompt.userId, userId), gte(draftPrompt.createdAt, since)),
    );

  return total;
};

// 진행 중 작업 유일 인덱스에 걸린 오류인지 (같은 초안에 이미 진행 중인 작업이 있음)
export const isActiveJobConflict = (error: unknown) => {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];

  return candidates.some((candidate) => {
    const { code, constraint_name: constraintName } = (candidate ??
      {}) as Record<string, unknown>;

    return (
      code === '23505' && constraintName === 'draft_prompt_draft_active_unique'
    );
  });
};

/* ---------- 작성기(Runner)가 쓰는 상태 전이 ---------- */

// queued → running (이미 시작했거나 끝난 작업이면 null)
export const markJobRunning = async (jobId: string) => {
  const [row] = await db
    .update(draftPrompt)
    .set({ status: 'running', startedAt: new Date() })
    .where(and(eq(draftPrompt.id, jobId), eq(draftPrompt.status, 'queued')))
    .returning({ channel: draftPrompt.channel });

  return row ?? null;
};

// 진행 단계 갱신 (running 인 작업만)
export const markJobStep = async (jobId: string, step: GenerationStep) => {
  const [row] = await db
    .update(draftPrompt)
    .set({ step })
    .where(and(eq(draftPrompt.id, jobId), eq(draftPrompt.status, 'running')))
    .returning({ id: draftPrompt.id });

  return Boolean(row);
};

// 작성 결과 저장 후 완료 (running 인 작업만)
export const completeJob = async (
  jobId: string,
  result: string,
  usedTokens?: number,
  usedCost?: number,
) => {
  const [row] = await db
    .update(draftPrompt)
    .set({
      status: 'completed',
      step: 3,
      result,
      usedTokens,
      usedCost,
      finishedAt: new Date(),
    })
    .where(and(eq(draftPrompt.id, jobId), eq(draftPrompt.status, 'running')))
    .returning({ id: draftPrompt.id });

  return Boolean(row);
};

// 실패 처리 (진행 중인 작업만, 사유 코드만 남기고 빈칸 채우기의 본문 스냅숏은 지움)
export const failJob = async (
  jobId: string,
  errorCode: GenerationErrorCode,
) => {
  const [row] = await db
    .update(draftPrompt)
    .set({
      status: 'failed',
      errorCode,
      finishedAt: new Date(),
      blankContext: null,
    })
    .where(
      and(
        eq(draftPrompt.id, jobId),
        inArray(draftPrompt.status, ACTIVE_STATUSES),
      ),
    )
    .returning({ channel: draftPrompt.channel });

  return row ?? null;
};

/**
 * 답변 대기 → queued 로 되돌려 다시 실행 (초안 작성 작업만)
 * - 조건부 UPDATE 라 다른 탭이 먼저 처리했으면 false (실행기를 두 번 부르지 않음)
 * - started_at 은 다시 대기열에 넣은 시각 (queued 시간 초과를 이 시각부터 잼)
 * - 답은 clarification.answers 에 저장, 건너뛰면 "skipped"
 */
export const requeueAwaitingJob = async (
  jobId: string,
  answers: GenerationClarificationAnswer[] | 'skipped',
) => {
  const [row] = await db
    .update(draftPrompt)
    .set({
      status: 'queued',
      step: 0,
      startedAt: new Date(),
      clarification: sql`jsonb_set(${draftPrompt.clarification}, '{answers}', ${JSON.stringify(answers)}::jsonb)`,
    })
    .where(
      and(
        eq(draftPrompt.id, jobId),
        eq(draftPrompt.kind, 'draft'),
        eq(draftPrompt.status, 'awaiting_input'),
      ),
    )
    .returning({ id: draftPrompt.id });

  return Boolean(row);
};

/**
 * 답변 대기 중인 작업을 취소 (cancelled 로 실패 처리, 잠금 해제)
 * @returns 이번 호출에서 취소했는지 (이미 처리됐으면 false)
 */
export const cancelAwaitingJob = async (jobId: string) => {
  const [row] = await db
    .update(draftPrompt)
    .set({
      status: 'failed',
      errorCode: 'cancelled',
      finishedAt: new Date(),
    })
    .where(
      and(eq(draftPrompt.id, jobId), eq(draftPrompt.status, 'awaiting_input')),
    )
    .returning({ id: draftPrompt.id });

  return Boolean(row);
};

/**
 * running → awaiting_input: 질문을 저장하고 멈춤 (가짜 작성기 전용, Lambda 의 pauseForInput 과 같은 규칙)
 * - 아직 묻지 않은 running 작업만 (이미 질문을 저장한 작업은 다시 멈추지 않음)
 * - 예상 사용량은 비워 멈춘 동안 할당량에 잡히지 않게 함
 */
export const pauseJobForInput = async (
  jobId: string,
  clarification: {
    reason: string;
    questions: GenerationClarificationQuestion[];
  },
) => {
  const [row] = await db
    .update(draftPrompt)
    .set({
      status: 'awaiting_input',
      clarification: {
        reason: clarification.reason,
        questions: clarification.questions,
        answers: null,
      },
      estimatedTokens: null,
      estimatedCost: null,
    })
    .where(
      and(
        eq(draftPrompt.id, jobId),
        eq(draftPrompt.status, 'running'),
        isNull(draftPrompt.clarification),
      ),
    )
    .returning({ channel: draftPrompt.channel });

  return row ?? null;
};
