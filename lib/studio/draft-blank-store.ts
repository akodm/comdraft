import 'server-only';
import type { JSONContent } from '@tiptap/core';
import { and, eq, not, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { draft } from '@/lib/db/schema';
import { lockingJobExists } from '@/lib/generation/jobs';
import { readDraftContentForUpdate } from '@/lib/images/cleanup';
import { ensureBlankIds } from '@/lib/studio/draft-blank';
import { isDraftDocument } from '@/lib/studio/draft-content';

const isSameDocument = (a: JSONContent, b: JSONContent) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * 저장된 본문의 빈칸에 id 를 붙여 저장 (id 가 없거나 겹치는 빈칸이 있을 때만, 초안을 열 때)
 * - 편집기와 빈칸 채우기 요청이 같은 id 를 보도록 서버 본문을 기준으로 맞춤
 * - 행 잠금으로 다시 읽은 본문에 붙임 (그 사이 자동 저장한 본문을 덮지 않음)
 * - 빈칸 id 만 바뀌므로 수정 시각과 게시 상태는 그대로, 초안 작성 작업이 잠근 초안은 저장하지 않음
 * @returns 편집기에 넘길 본문 (id 를 붙인 본문)
 */
export const persistBlankIds = async (
  draftId: string,
  content: JSONContent,
): Promise<JSONContent> => {
  if (isSameDocument(ensureBlankIds(content), content)) {
    return content;
  }

  return db.transaction(async (tx) => {
    const current = await readDraftContentForUpdate(tx, draftId);

    if (!isDraftDocument(current)) {
      return ensureBlankIds(content);
    }

    const withIds = ensureBlankIds(current);

    if (!isSameDocument(withIds, current)) {
      await tx
        .update(draft)
        .set({ content: withIds, updatedAt: sql`${draft.updatedAt}` })
        .where(and(eq(draft.id, draftId), not(lockingJobExists(draft.id))));
    }

    return withIds;
  });
};
