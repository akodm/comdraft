import 'server-only';
import { cache } from 'react';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { JSONContent } from '@tiptap/core';
import { db } from '@/lib/db';
import {
  draft,
  draftReferenceLink,
  githubRepository,
  post,
  userRepository,
  type DraftStatus,
  type PostVisibility,
} from '@/lib/db/schema';
import { isDraftDocument } from '@/lib/studio/draft-content';
import {
  DEFAULT_PROMPT_OPTIONS,
  parsePromptOptions,
  type PromptOptions,
} from '@/lib/studio/options';
import type { ReferenceLink } from '@/lib/studio/reference-link';
import { isJobResumable } from '@/lib/generation/job-state';
import {
  getLatestDraftJob,
  getLatestDraftJobOptions,
  syncDraftJobs,
  type GenerationJobView,
} from '@/lib/generation/jobs';
import { persistBlankIds } from '@/lib/studio/draft-blank-store';

// 스튜디오 사이드바 상단에 표시하는 저장소 정보
export interface StudioRepository {
  id: string;
  ownerLogin: string;
  name: string;
  htmlUrl: string;
  branch: string;
  // 비공개 저장소 여부 (게시하면 코드가 공개된다는 경고에 사용)
  isPrivate: boolean;
}

// 초안 목록 항목
export interface StudioDraftSummary {
  id: string;
  title: string;
  status: DraftStatus;
  // 게시한 초안의 공개 범위 (post 조인 결과, 게시 전에는 null)
  visibility: PostVisibility | null;
}

// 편집기에서 여는 초안
export interface StudioDraft extends StudioDraftSummary {
  content: JSONContent | null;
  // 게시글 (게시 전에는 null, 주소 생성과 공개 범위에 사용)
  post: { id: string; slug: string; visibility: PostVisibility } | null;
  // 마지막 초안 작성 요청의 기본 옵션 (빈칸 채우기 작업은 건너뜀, 요청 기록이 없으면 기본값)
  promptOptions: PromptOptions;
  // 추가한 순서대로
  referenceLinks: ReferenceLink[];
  // 이어서 보여 줄 AI 작업 (종류와 무관하게 가장 최근 작업이 진행 중이거나 최근에 실패했으면)
  resumableJob: GenerationJobView | null;
  // 마지막으로 본문 전체를 바꾼 초안 작성 작업 id (바뀌면 편집기가 새 본문을 다시 불러옴)
  // - 빈칸 채우기는 편집기가 그 빈칸만 직접 바꾸므로 넣지 않음 (다시 불러오면 저장 전 편집이 사라짐)
  contentRevision: string | null;
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
        isPrivate: githubRepository.isPrivate,
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
      visibility: post.visibility,
    })
    .from(draft)
    .leftJoin(post, eq(post.draftId, draft.id))
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
  if (!(await isOwnedDraft(userId, repositoryId, draftId))) {
    return null;
  }

  // 화면을 열 때 시간 초과된 작업 정리 + 완료한 결과 반영 (본문을 읽기 전에, 빈칸 채우기 결과도)
  await syncDraftJobs(draftId, { applyFills: true });

  const [row] = await db
    .select({
      id: draft.id,
      title: draft.title,
      status: draft.status,
      visibility: post.visibility,
      postId: post.id,
      postSlug: post.slug,
      content: draft.content,
    })
    .from(draft)
    .leftJoin(post, eq(post.draftId, draft.id))
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

  const [content, lastPrompt, referenceLinks, latestJob, latestDraftJob] =
    await Promise.all([
      // id 가 없는 빈칸(기능 추가 전 본문)에 id 를 붙여 저장 (빈칸 채우기는 저장된 id 로 찾음)
      isDraftDocument(row.content)
        ? persistBlankIds(row.id, row.content)
        : null,
      getLatestDraftJobOptions(row.id),
      listDraftReferenceLinks(row.id),
      getLatestDraftJob(row.id),
      getLatestDraftJob(row.id, 'draft'),
    ]);

  const { postId, postSlug, ...draftRow } = row;

  return {
    ...draftRow,
    post:
      postId !== null && postSlug !== null && row.visibility !== null
        ? { id: postId, slug: postSlug, visibility: row.visibility }
        : null,
    content,
    promptOptions: parsePromptOptions(lastPrompt) ?? DEFAULT_PROMPT_OPTIONS,
    referenceLinks,
    resumableJob:
      latestJob && isJobResumable(latestJob, new Date()) ? latestJob : null,
    contentRevision:
      latestDraftJob?.status === 'completed' && latestDraftJob.applied
        ? latestDraftJob.id
        : null,
  };
};
