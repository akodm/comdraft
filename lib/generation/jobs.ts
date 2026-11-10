import 'server-only';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { draft, draftPrompt } from '@/lib/db/schema';
import type {
  GenerationErrorCode,
  GenerationStatus,
  GenerationStep,
} from '@/lib/generation/contract';
import { isGenerationErrorCode } from '@/lib/generation/contract';
import { getStaleCutoffs } from '@/lib/generation/job-state';
import { markdownToDraftDocument } from '@/lib/generation/markdown';
import { extractDraftTitle } from '@/lib/studio/draft-content';

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
  channel: string;
  status: GenerationStatus;
  step: GenerationStep;
  errorCode: GenerationErrorCode | null;
  // 결과를 초안에 반영했는지 (완료 + 미반영이면 편집 잠금)
  applied: boolean;
  finishedAt: string | null;
}

const ACTIVE_STATUSES: GenerationStatus[] = ['queued', 'running'];

const jobViewColumns = {
  id: draftPrompt.id,
  channel: draftPrompt.channel,
  status: draftPrompt.status,
  step: draftPrompt.step,
  errorCode: draftPrompt.errorCode,
  appliedAt: draftPrompt.appliedAt,
  finishedAt: draftPrompt.finishedAt,
};

interface JobViewRow {
  id: string;
  channel: string;
  status: GenerationStatus;
  step: number;
  errorCode: string | null;
  appliedAt: Date | null;
  finishedAt: Date | null;
}

const toJobView = (row: JobViewRow): GenerationJobView => ({
  id: row.id,
  channel: row.channel,
  status: row.status,
  step: Math.min(Math.max(row.step, 0), 3) as GenerationStep,
  errorCode: isGenerationErrorCode(row.errorCode) ? row.errorCode : null,
  applied: row.appliedAt !== null,
  finishedAt: row.finishedAt?.toISOString() ?? null,
});

/**
 * 초안을 잠그는 작업이 있는지 (SQL 조건, 초안 id 컬럼 기준)
 * - 진행 중(queued/running)이거나 완료 후 아직 반영하지 않은 작업
 */
export const lockingJobExists = (draftIdColumn: PgColumn): SQL => sql`exists (
  select 1 from ${draftPrompt}
  where ${draftPrompt.draftId} = ${draftIdColumn}
    and (${draftPrompt.status} in ('queued', 'running')
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

// 시간 제한을 넘긴 진행 중 작업을 timeout 으로 실패 처리 (초안, 작업 하나 또는 사용자 기준)
export const expireStaleJobs = async (
  target: ExpireTarget,
  now = new Date(),
) => {
  const { runningStartedBefore, queuedCreatedBefore } = getStaleCutoffs(now);

  await db
    .update(draftPrompt)
    .set({ status: 'failed', errorCode: 'timeout', finishedAt: now })
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
            lt(draftPrompt.createdAt, queuedCreatedBefore),
          ),
        ),
      ),
    );
};

/**
 * 완료한 작업의 결과(Markdown)를 초안 본문에 한 번만 반영
 * - applied_at 을 먼저 선점한 요청만 반영하므로 여러 번 호출해도 결과는 한 번만 들어감
 * - 결과가 없거나 변환에 실패하면 작업을 invalid_result 로 실패 처리 (잠금 해제)
 * @returns 이번 호출에서 반영했는지
 */
export const applyCompletedJob = async (jobId: string) => {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [claimed] = await tx
      .update(draftPrompt)
      .set({ appliedAt: now })
      .where(
        and(
          eq(draftPrompt.id, jobId),
          eq(draftPrompt.status, 'completed'),
          isNull(draftPrompt.appliedAt),
        ),
      )
      .returning({ draftId: draftPrompt.draftId, result: draftPrompt.result });

    // 그 사이 초안이 삭제됐으면 반영할 곳이 없음 (작업 행은 사용량 기록으로만 남음)
    if (!claimed?.draftId) {
      return false;
    }

    let content: ReturnType<typeof markdownToDraftDocument> | null = null;

    try {
      content = claimed.result ? markdownToDraftDocument(claimed.result) : null;
    } catch {
      content = null;
    }

    if (!content) {
      await tx
        .update(draftPrompt)
        .set({ status: 'failed', errorCode: 'invalid_result' })
        .where(eq(draftPrompt.id, jobId));

      return false;
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

    return true;
  });
};

/**
 * 초안의 작업 상태 정리: 시간 초과 처리 후, 완료했지만 반영하지 않은 결과 반영
 * - 스튜디오 화면을 열 때, 초안을 바꾸는 액션 전에 호출
 */
export const syncDraftJobs = async (draftId: string) => {
  await expireStaleJobs({ draftId });

  const pending = await db
    .select({ id: draftPrompt.id })
    .from(draftPrompt)
    .where(
      and(
        eq(draftPrompt.draftId, draftId),
        eq(draftPrompt.status, 'completed'),
        isNull(draftPrompt.appliedAt),
      ),
    );

  for (const { id } of pending) {
    await applyCompletedJob(id);
  }
};

// 초안을 바꿀 수 없는 상태인지 (정리 후 진행 중 작업이 남아 있으면 잠금)
export const isDraftLocked = async (draftId: string) => {
  await syncDraftJobs(draftId);

  const [active] = await db
    .select({ id: draftPrompt.id })
    .from(draftPrompt)
    .where(
      and(
        eq(draftPrompt.draftId, draftId),
        inArray(draftPrompt.status, ACTIVE_STATUSES),
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

// 초안의 가장 최근 작업
export const getLatestDraftJob = async (
  draftId: string,
): Promise<GenerationJobView | null> => {
  const [row] = await db
    .select(jobViewColumns)
    .from(draftPrompt)
    .where(eq(draftPrompt.draftId, draftId))
    .orderBy(desc(draftPrompt.createdAt))
    .limit(1);

  return row ? toJobView(row) : null;
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
) => {
  const [row] = await db
    .update(draftPrompt)
    .set({
      status: 'completed',
      step: 3,
      result,
      usedTokens,
      finishedAt: new Date(),
    })
    .where(and(eq(draftPrompt.id, jobId), eq(draftPrompt.status, 'running')))
    .returning({ id: draftPrompt.id });

  return Boolean(row);
};

// 실패 처리 (진행 중인 작업만, 사유 코드만 남김)
export const failJob = async (
  jobId: string,
  errorCode: GenerationErrorCode,
) => {
  const [row] = await db
    .update(draftPrompt)
    .set({ status: 'failed', errorCode, finishedAt: new Date() })
    .where(
      and(
        eq(draftPrompt.id, jobId),
        inArray(draftPrompt.status, ACTIVE_STATUSES),
      ),
    )
    .returning({ channel: draftPrompt.channel });

  return row ?? null;
};
