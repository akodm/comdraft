import { and, eq, isNotNull, ne, or } from 'drizzle-orm';
import { draftPrompt } from '@/lib/db/schema/draft';

/**
 * 어드민이 숨겨도 되는(완전히 끝난) 작업 규칙
 * - 실패한 작업
 * - 완료한 작업. 단 초안 작성(kind='draft')은 결과를 초안에 반영한 뒤에만
 *   (반영 전에는 lockingJobExists 가 초안 편집을 잠그므로)
 * - 진행 중·답변 대기는 항상 제외. 빈칸 채우기는 편집 잠금 대상이 아니라 반영 여부와 무관
 * 서버 액션(SQL)과 화면(TS)이 같은 규칙을 쓰도록 한 곳에 둠
 */
export const isPromptSettled = (job: {
  kind: string;
  status: string;
  appliedAt: Date | null;
}): boolean =>
  job.status === 'failed' ||
  (job.status === 'completed' &&
    (job.kind !== 'draft' || job.appliedAt !== null));

// isPromptSettled 와 같은 규칙의 SQL 조건
export const settledPromptCondition = () =>
  or(
    eq(draftPrompt.status, 'failed'),
    and(
      eq(draftPrompt.status, 'completed'),
      or(ne(draftPrompt.kind, 'draft'), isNotNull(draftPrompt.appliedAt)),
    ),
  );
