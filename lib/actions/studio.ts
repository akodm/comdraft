'use server';

import { and, eq, not } from 'drizzle-orm';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { draft, type DraftStatus } from '@/lib/db/schema';
import {
  draftStatusAfterContentChange,
  isDraftLocked,
  lockingJobExists,
  syncDraftJobs,
} from '@/lib/generation/jobs';
import { COMMITS_PER_PAGE, listRepositoryCommits } from '@/lib/github/commits';
import { GithubApiError, GithubUserTokenError } from '@/lib/github/user-api';
import {
  listDraftImages,
  markImagesUsed,
  readDraftContentForUpdate,
  scheduleDraftImageCleanup,
  scheduleDraftImageRemoval,
} from '@/lib/images/cleanup';
import { parseImagePath, removeDisallowedImages } from '@/lib/images/rules';
import { normalizeTags } from '@/lib/posts/tags';
import {
  extractDraftTitle,
  getCommitSubject,
  parseDraftDocument,
} from '@/lib/studio/draft-content';
import { isOwnedDraft } from '@/lib/studio/queries';
import { getSupabaseUrl } from '@/lib/supabase/server';

// 커밋 내역 사이드바에 필요한 값만 전달 (커밋 내용은 저장하지 않음)
export interface StudioCommit {
  sha: string;
  // 커밋 메시지 첫 줄
  subject: string;
  htmlUrl: string;
}

export type StudioCommitsResult =
  | { status: 'ok'; commits: StudioCommit[]; hasNextPage: boolean }
  // GitHub 토큰 만료/갱신 실패 → 다시 로그인 필요
  | { status: 'github_reauth' }
  // 연동하지 않은 저장소이거나 GitHub 에서 저장소 권한이 해제됨
  | { status: 'unavailable' };

// GitHub 페이지 번호 상한 (30개씩 3만 개)
const MAX_COMMIT_PAGE = 1000;

/**
 * 스튜디오 커밋 내역 한 페이지 (추적 브랜치, 최신순 30개)
 * - 커밋은 DB 에 저장하지 않고 매번 사용자 토큰으로 GitHub API 를 조회
 */
export async function loadStudioCommits(
  repositoryId: string,
  page: number,
): Promise<StudioCommitsResult> {
  const { user } = await requireSession();

  if (!Number.isInteger(page) || page < 1 || page > MAX_COMMIT_PAGE) {
    return { status: 'ok', commits: [], hasNextPage: false };
  }

  try {
    const result = await listRepositoryCommits({
      userId: user.id,
      requestHeaders: await headers(),
      repositoryId,
      page,
      perPage: COMMITS_PER_PAGE,
    });

    if (!result) {
      return { status: 'unavailable' };
    }

    return {
      status: 'ok',
      hasNextPage: result.hasNextPage,
      commits: result.commits.map(({ sha, message, htmlUrl }) => ({
        sha,
        subject: getCommitSubject(message),
        htmlUrl,
      })),
    };
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return { status: 'github_reauth' };
    }

    // 409: 커밋이 하나도 없는 빈 저장소
    if (error instanceof GithubApiError && error.status === 409) {
      return { status: 'ok', commits: [], hasNextPage: false };
    }

    // 403/404: GitHub 에서 저장소 권한이 해제되었거나 브랜치가 삭제됨
    if (
      error instanceof GithubApiError &&
      (error.status === 403 || error.status === 404)
    ) {
      return { status: 'unavailable' };
    }

    throw error;
  }
}

export type SaveDraftContentResult =
  | { status: 'saved'; title: string; draftStatus: DraftStatus }
  | { status: 'invalid' }
  // AI 작성 중이라 편집 잠금
  | { status: 'locked' }
  | { status: 'not_found' };

/**
 * 편집기 자동 저장 (본문 + 목록 표시용 제목)
 * - 본문은 JSON 문자열로 받음: ProseMirror 의 attrs 는 프로토타입 없는 객체라
 *   Server Action 인자로 그대로 넘기면 직렬화 과정에서 빠짐 (제목 단계, 링크 주소, 코드 언어 등)
 * - 목록 순서가 매번 바뀌지 않도록 화면은 다시 렌더링하지 않고, 바뀐 제목만 돌려줌
 * - AI 작성 작업이 진행 중(또는 결과 반영 전)이면 저장하지 않음 (같은 UPDATE 조건으로 확인)
 * - 게시한 초안을 고치면 같은 UPDATE 에서 임시 저장 상태로 바꿈 (게시글 스냅샷은 그대로)
 * - 이미지는 그 사용자의 공개 버킷 주소만 남김 (blob:, 외부 주소, 다른 사용자 경로는 노드째 지움)
 * - 바뀌기 전 본문과 저장한 본문에 든 이미지는 같은 트랜잭션에서 마지막 사용 시각을 갱신
 *   (정리 유예가 이때부터 다시 시작: 이번 저장으로 빠진 이미지도 10분 안에 다시 붙여 넣으면 남음)
 * - 저장 후 응답 뒤에 쓰지 않는 이미지를 정리 (정리 실패는 저장 결과를 바꾸지 않고 다음 정리 때 다시 시도)
 */
export async function saveDraftContent(
  repositoryId: string,
  draftId: string,
  contentJson: string,
): Promise<SaveDraftContentResult> {
  const { user } = await requireSession();
  const parsed = parseDraftDocument(contentJson);

  if (!parsed) {
    return { status: 'invalid' };
  }

  if (!(await isOwnedDraft(user.id, repositoryId, draftId))) {
    return { status: 'not_found' };
  }

  // 시간 초과된 작업 정리, 완료한 결과 반영 (반영되면 잠금이 풀림)
  await syncDraftJobs(draftId);

  const supabaseUrl = getSupabaseUrl();
  const content = removeDisallowedImages(
    parsed,
    (src) => parseImagePath(supabaseUrl, src, user.id) !== null,
  );
  const title = extractDraftTitle(content);
  const updated = await db.transaction(async (tx) => {
    const previous = await readDraftContentForUpdate(tx, draftId);
    const [row] = await tx
      .update(draft)
      .set({
        content,
        title,
        status: draftStatusAfterContentChange(),
      })
      .where(and(eq(draft.id, draftId), not(lockingJobExists(draft.id))))
      .returning({ id: draft.id, status: draft.status });

    if (row) {
      await markImagesUsed(tx, user.id, [previous, content]);
    }

    return row;
  });

  if (!updated) {
    return { status: 'locked' };
  }

  scheduleDraftImageCleanup(draftId);

  return { status: 'saved', title, draftStatus: updated.status };
}

export type SaveDraftTagsResult =
  | { status: 'saved'; tags: string[]; draftStatus: DraftStatus }
  | { status: 'invalid' }
  // AI 작성 중이라 편집 잠금 (결과가 태그를 바꾸므로)
  | { status: 'locked' }
  | { status: 'not_found' };

/**
 * 편집기 태그 저장 (추가·삭제할 때마다, 본문 자동 저장과 별개)
 * - 서버 액션 인자는 신뢰할 수 없으므로 lib/posts/tags.ts 규칙으로 정규화한 값을 저장하고 돌려줌
 * - 잠금 조건과 게시한 초안의 임시 저장 상태 전환은 본문 자동 저장과 같음
 */
export async function saveDraftTags(
  repositoryId: string,
  draftId: string,
  tags: string[],
): Promise<SaveDraftTagsResult> {
  const { user } = await requireSession();

  if (!Array.isArray(tags)) {
    return { status: 'invalid' };
  }

  if (!(await isOwnedDraft(user.id, repositoryId, draftId))) {
    return { status: 'not_found' };
  }

  await syncDraftJobs(draftId);

  const normalized = normalizeTags(tags);
  const [updated] = await db
    .update(draft)
    .set({ tags: normalized, status: draftStatusAfterContentChange() })
    .where(and(eq(draft.id, draftId), not(lockingJobExists(draft.id))))
    .returning({ status: draft.status });

  if (!updated) {
    return { status: 'locked' };
  }

  return { status: 'saved', tags: normalized, draftStatus: updated.status };
}

export type DeleteDraftResult =
  | { status: 'deleted' }
  // AI 작성 중이라 삭제할 수 없음
  | { status: 'locked' }
  | { status: 'not_found' };

/**
 * 초안 삭제 (본인이 해당 저장소에 만든 초안만, 참고 링크도 함께 삭제)
 * - 작성 요청 기록(작업)은 남기고 draft_id 만 비움 (주간 사용량과 요청 기록 유지)
 * - 화면은 다시 렌더링하지 않음: 열려 있는 초안이면 다시 그리는 순간 404 가 되므로,
 *   목록에서 숨기고 다른 초안으로 옮기는 일은 클라이언트가 처리
 * - AI 작성 작업이 진행 중이면 삭제하지 않음
 * - 그 초안에 올린 이미지는 삭제 전에 모아 두고, 삭제(게시글도 함께) 후 응답 뒤에 파일과 행을 유예 없이 지움
 *   (같은 사용자의 다른 초안·게시글이 쓰는 이미지는 남김)
 */
export async function deleteDraft(
  repositoryId: string,
  draftId: string,
): Promise<DeleteDraftResult> {
  const { user } = await requireSession();

  if (!(await isOwnedDraft(user.id, repositoryId, draftId))) {
    return { status: 'not_found' };
  }

  if (await isDraftLocked(draftId)) {
    return { status: 'locked' };
  }

  // 삭제하면 행의 draft_id 가 비므로 먼저 모아 둠
  const images = await listDraftImages(draftId);
  const deleted = await db
    .delete(draft)
    .where(
      and(
        eq(draft.id, draftId),
        eq(draft.userId, user.id),
        eq(draft.repositoryId, repositoryId),
      ),
    )
    .returning({ id: draft.id });

  if (deleted.length === 0) {
    return { status: 'not_found' };
  }

  scheduleDraftImageRemoval(user.id, images);

  return { status: 'deleted' };
}
