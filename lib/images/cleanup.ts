import 'server-only';
import type { JSONContent } from '@tiptap/core';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { after } from 'next/server';
import { db } from '@/lib/db';
import { draft, image, post } from '@/lib/db/schema';
import {
  collectImageSrcs,
  excludeReferencedImages,
  findCleanupCandidates,
  parseImagePath,
} from '@/lib/images/rules';
import { removeImages } from '@/lib/images/storage';
import { getSupabaseUrl } from '@/lib/supabase/server';

/**
 * 쓰지 않는 이미지 정리 (spec 6장)
 * - 대상: 그 초안의 image 행 중 경로가 초안 본문에도 게시글 본문에도 없는 것
 *   (기본은 마지막 사용 시각 last_used_at 에서 10분 지난 것만)
 *   + 초안이 지워져 draft_id 가 빈 그 사용자의 행 (항상 10분 유예)
 * - 본문을 저장할 때마다 그 본문에 든 이미지의 last_used_at 을 갱신 (markImagesUsed):
 *   올린 지 오래된 이미지를 잘라 내 저장한 뒤 다시 붙여 넣어도 유예 안에서는 지우지 않음
 * - 같은 사용자의 다른 초안·게시글 본문이 쓰는 경로는 지우지 않음 (초안 사이에 복사한 이미지)
 * - Storage 삭제가 성공했을 때만 행을 지움: 실패하면 행을 남기고(다음 정리 때 다시 시도) 오류를 던짐
 * - 저장·게시 같은 본 작업의 결과를 바꾸지 않도록 응답 뒤(after)에 실행하는 함수를 함께 둠
 *   (after 안에서 던진 오류는 응답에 영향이 없고 Next 가 서버 로그로 남김)
 */

interface ImageRef {
  id: string;
  path: string;
}

/** 초안에 올린 이미지 행 (초안 삭제 전에 모아 둘 때 사용) */
export const listDraftImages = (draftId: string): Promise<ImageRef[]> =>
  db
    .select({ id: image.id, path: image.path })
    .from(image)
    .where(eq(image.draftId, draftId));

/** Storage 에서 이미지 파일을 지우지 못함 (행은 남아 있음) */
export class ImageRemovalError extends Error {
  constructor(count: number) {
    super(`이미지 파일 ${count}개를 지우지 못했습니다. 기록은 남겨 둡니다.`);
    this.name = 'ImageRemovalError';
  }
}

/**
 * 이미지 파일을 지우고, 성공하면 행도 지움
 * - Storage 삭제가 실패하면 행을 남기고 ImageRemovalError
 */
export const removeDraftImages = async (images: ImageRef[]): Promise<void> => {
  if (images.length === 0) {
    return;
  }

  if (!(await removeImages(images.map(({ path }) => path)))) {
    throw new ImageRemovalError(images.length);
  }

  await db.delete(image).where(
    inArray(
      image.id,
      images.map(({ id }) => id),
    ),
  );
};

// 본문 속 이미지 중 그 사용자의 공개 버킷 경로
const collectUsedPaths = (
  contents: unknown[],
  userId: string,
  supabaseUrl: string,
): Set<string> =>
  new Set(
    contents
      .flatMap((content) => collectImageSrcs(content as JSONContent | null))
      .flatMap((src) => {
        const path = parseImagePath(supabaseUrl, src, userId);

        return path ? [path] : [];
      }),
  );

// update 를 쓸 수 있는 실행기 (db 또는 트랜잭션)
type UpdateExecutor = Pick<typeof db, 'update'>;

/**
 * 저장하는 본문들에 든 그 사용자의 이미지 행의 마지막 사용 시각을 지금으로 (쿼리 하나, 이미지가 없으면 쿼리 없음)
 * - 본문 저장과 같은 트랜잭션 안이나 저장 바로 뒤, 정리를 예약하기 전에 부름
 * @param contents 이미지 규칙으로 이미 정리한 본문 (초안·게시글)
 */
export const markImagesUsed = async (
  executor: UpdateExecutor,
  userId: string,
  contents: unknown[],
): Promise<void> => {
  const paths = [...collectUsedPaths(contents, userId, getSupabaseUrl())];

  if (paths.length === 0) {
    return;
  }

  await executor
    .update(image)
    .set({ lastUsedAt: sql`now()` })
    .where(and(eq(image.userId, userId), inArray(image.path, paths)));
};

/**
 * 후보 경로 중 그 사용자의 다른 초안·게시글 본문에 들어 있는 것 (쿼리 하나)
 * - 본문 JSON 문자열에 경로가 들어 있는지로 판단: 링크 글자 등에 들어 있어도 쓰는 것으로 보고 남김 (지우는 쪽보다 안전)
 * @param excludeDraftId 이 초안과 그 게시글은 제외 (본문은 호출하는 쪽이 이미 확인), null 이면 모두 확인
 */
const findReferencedPaths = async (
  userId: string,
  paths: string[],
  excludeDraftId: string | null,
): Promise<Set<string>> => {
  if (paths.length === 0) {
    return new Set();
  }

  const candidates = sql.join(
    paths.map((path) => sql`(${path}::text)`),
    sql`, `,
  );
  const otherDraft = excludeDraftId
    ? sql`and ${draft.id} <> ${excludeDraftId}`
    : sql``;
  const otherPost = excludeDraftId
    ? sql`and ${post.draftId} <> ${excludeDraftId}`
    : sql``;
  const rows = await db.execute<{ path: string }>(sql`
    select candidate.path from (values ${candidates}) as candidate(path)
    where exists (
      select 1 from ${draft}
      where ${draft.userId} = ${userId} ${otherDraft}
        and position(candidate.path in ${draft.content}::text) > 0
    ) or exists (
      select 1 from ${post}
      where ${post.userId} = ${userId} ${otherPost}
        and position(candidate.path in ${post.content}::text) > 0
    )
  `);

  return new Set(rows.map(({ path }) => path));
};

/**
 * 초안 본문과 게시글 본문 어디에도 없는 그 초안의 이미지 정리 (주인 없는 그 사용자의 이미지도 함께)
 * - 같은 사용자의 다른 초안·게시글이 쓰는 경로는 남김
 * - Storage 삭제가 실패하면 행을 남기고 ImageRemovalError (다음 정리 때 다시 시도)
 */
export const cleanupDraftImages = async (
  draftId: string,
  options: { grace: boolean } = { grace: true },
): Promise<void> => {
  // 이미지 행을 먼저 봄: 이미지가 없는 초안(대부분의 저장)은 본문을 읽지 않고 끝냄
  const draftOwner = db
    .select({ userId: draft.userId })
    .from(draft)
    .where(eq(draft.id, draftId));
  const images = await db
    .select({
      id: image.id,
      path: image.path,
      lastUsedAt: image.lastUsedAt,
      draftId: image.draftId,
    })
    .from(image)
    .where(
      or(
        eq(image.draftId, draftId),
        and(isNull(image.draftId), inArray(image.userId, draftOwner)),
      ),
    );

  if (images.length === 0) {
    return;
  }

  const [row] = await db
    .select({
      userId: draft.userId,
      draftContent: draft.content,
      postContent: post.content,
    })
    .from(draft)
    .leftJoin(post, eq(post.draftId, draft.id))
    .where(eq(draft.id, draftId))
    .limit(1);

  // 그 사이 초안이 지워짐: 그 초안의 행은 삭제 흐름이, 주인 없는 행은 다음 정리가 맡음
  if (!row) {
    return;
  }

  const usedPaths = collectUsedPaths(
    [row.draftContent, row.postContent],
    row.userId,
    getSupabaseUrl(),
  );
  const candidates = findCleanupCandidates(
    images.filter((item) => item.draftId === draftId),
    images.filter((item) => item.draftId === null),
    usedPaths,
    new Date(),
    options,
  );

  if (candidates.length === 0) {
    return;
  }

  const referenced = await findReferencedPaths(
    row.userId,
    candidates.map(({ path }) => path),
    draftId,
  );

  await removeDraftImages(excludeReferencedImages(candidates, referenced));
};

/** 응답 뒤에 초안 이미지 정리 (정리 실패가 저장·게시 결과를 바꾸지 않음) */
export const scheduleDraftImageCleanup = (draftId: string) => {
  after(() => cleanupDraftImages(draftId));
};

/**
 * 응답 뒤에 지운 초안의 이미지 파일과 행 삭제 (유예 없음)
 * - 같은 사용자의 다른 초안·게시글이 쓰는 경로는 남김: 그 행은 주인 없는 행이 되어 쓰지 않게 된 뒤 다음 정리 때 지워짐
 */
export const scheduleDraftImageRemoval = (
  userId: string,
  images: ImageRef[],
) => {
  if (images.length === 0) {
    return;
  }

  after(async () => {
    const referenced = await findReferencedPaths(
      userId,
      images.map(({ path }) => path),
      null,
    );

    await removeDraftImages(excludeReferencedImages(images, referenced));
  });
};
