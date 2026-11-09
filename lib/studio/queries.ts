import 'server-only';
import { cache } from 'react';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { JSONContent } from '@tiptap/core';
import { db } from '@/lib/db';
import {
  draft,
  draftPrompt,
  draftReferenceLink,
  githubRepository,
  userRepository,
  type DraftStatus,
  type DraftVisibility,
} from '@/lib/db/schema';
import { isDraftDocument } from '@/lib/studio/draft-content';
import {
  DEFAULT_PROMPT_OPTIONS,
  parsePromptOptions,
  type PromptOptions,
} from '@/lib/studio/options';
import type { ReferenceLink } from '@/lib/studio/reference-link';

// 스튜디오 사이드바 상단에 표시하는 저장소 정보
export interface StudioRepository {
  id: string;
  ownerLogin: string;
  name: string;
  htmlUrl: string;
  branch: string;
}

// 초안 목록 항목
export interface StudioDraftSummary {
  id: string;
  title: string;
  status: DraftStatus;
  visibility: DraftVisibility | null;
}

// 편집기에서 여는 초안
export interface StudioDraft extends StudioDraftSummary {
  content: JSONContent | null;
  // 마지막 작성 요청의 기본 옵션 (요청 기록이 없으면 기본값)
  promptOptions: PromptOptions;
  // 추가한 순서대로
  referenceLinks: ReferenceLink[];
}

/**
 * 사용자가 연동한 저장소 (연동하지 않았으면 null)
 * - 스튜디오 레이아웃과 페이지가 같은 요청에서 함께 호출하므로 React cache 로 1회만 조회
 */
export const getStudioRepository = cache(
  async (
    userId: string,
    repositoryId: string,
  ): Promise<StudioRepository | null> => {
    const [repository] = await db
      .select({
        id: githubRepository.id,
        ownerLogin: githubRepository.ownerLogin,
        name: githubRepository.name,
        htmlUrl: githubRepository.htmlUrl,
        branch: userRepository.branch,
      })
      .from(userRepository)
      .innerJoin(
        githubRepository,
        eq(userRepository.repositoryId, githubRepository.id),
      )
      .where(
        and(
          eq(userRepository.userId, userId),
          eq(userRepository.repositoryId, repositoryId),
        ),
      )
      .limit(1);

    return repository ?? null;
  },
);

// 저장소의 초안 전체 (최근 수정순, 개수 제한 없음)
export const listStudioDrafts = async (
  userId: string,
  repositoryId: string,
): Promise<StudioDraftSummary[]> => {
  return db
    .select({
      id: draft.id,
      title: draft.title,
      status: draft.status,
      visibility: draft.visibility,
    })
    .from(draft)
    .where(and(eq(draft.userId, userId), eq(draft.repositoryId, repositoryId)))
    .orderBy(desc(draft.updatedAt), desc(draft.id));
};

// 본인이 해당 저장소에 만든 초안인지 (초안을 바꾸는 액션의 권한 확인용)
export const isOwnedDraft = async (
  userId: string,
  repositoryId: string,
  draftId: string,
) => {
  const [row] = await db
    .select({ id: draft.id })
    .from(draft)
    .where(
      and(
        eq(draft.id, draftId),
        eq(draft.userId, userId),
        eq(draft.repositoryId, repositoryId),
      ),
    )
    .limit(1);

  return Boolean(row);
};

// 초안의 참고 링크 (추가한 순서대로)
export const listDraftReferenceLinks = async (
  draftId: string,
): Promise<ReferenceLink[]> => {
  return db
    .select({ id: draftReferenceLink.id, url: draftReferenceLink.url })
    .from(draftReferenceLink)
    .where(eq(draftReferenceLink.draftId, draftId))
    .orderBy(asc(draftReferenceLink.createdAt), asc(draftReferenceLink.id));
};

// 본인이 해당 저장소에 만든 초안 (아니면 null)
export const getStudioDraft = async (
  userId: string,
  repositoryId: string,
  draftId: string,
): Promise<StudioDraft | null> => {
  const [row] = await db
    .select({
      id: draft.id,
      title: draft.title,
      status: draft.status,
      visibility: draft.visibility,
      content: draft.content,
    })
    .from(draft)
    .where(
      and(
        eq(draft.id, draftId),
        eq(draft.userId, userId),
        eq(draft.repositoryId, repositoryId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const [[lastPrompt], referenceLinks] = await Promise.all([
    db
      .select({
        tone: draftPrompt.tone,
        postType: draftPrompt.postType,
        length: draftPrompt.length,
        requiredBlocks: draftPrompt.requiredBlocks,
      })
      .from(draftPrompt)
      .where(eq(draftPrompt.draftId, row.id))
      .orderBy(desc(draftPrompt.createdAt))
      .limit(1),
    listDraftReferenceLinks(row.id),
  ]);

  return {
    ...row,
    content: isDraftDocument(row.content) ? row.content : null,
    promptOptions: parsePromptOptions(lastPrompt) ?? DEFAULT_PROMPT_OPTIONS,
    referenceLinks,
  };
};
