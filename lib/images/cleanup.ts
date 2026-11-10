import 'server-only';
import type { JSONContent } from '@tiptap/core';
import { eq, inArray } from 'drizzle-orm';
import { after } from 'next/server';
import { db } from '@/lib/db';
import { draft, image, post } from '@/lib/db/schema';
import {
  collectImageSrcs,
  findUnusedImages,
  parseImagePath,
} from '@/lib/images/rules';
import { removeImages } from '@/lib/images/storage';
import { getSupabaseUrl } from '@/lib/supabase/server';

/**
 * 쓰지 않는 이미지 정리 (spec 6장)
 * - 대상: 그 초안의 image 행 중 경로가 초안 본문에도 게시글 본문에도 없는 것 (기본은 올린 지 10분 지난 것만)
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

/**
 * 초안 본문과 게시글 본문 어디에도 없는 그 초안의 이미지 정리
 * - Storage 삭제가 실패하면 행을 남기고 ImageRemovalError (다음 정리 때 다시 시도)
 */
export const cleanupDraftImages = async (
  draftId: string,
  options: { grace: boolean } = { grace: true },
): Promise<void> => {
  const images = await db
    .select({ id: image.id, path: image.path, createdAt: image.createdAt })
    .from(image)
    .where(eq(image.draftId, draftId));

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

  // 초안이 지워지면 행의 draft_id 가 비므로 여기까지 오지 않음 (지운 초안의 이미지는 removeDraftImages 로)
  if (!row) {
    return;
  }

  const usedPaths = collectUsedPaths(
    [row.draftContent, row.postContent],
    row.userId,
    getSupabaseUrl(),
  );

  await removeDraftImages(
    findUnusedImages(images, usedPaths, new Date(), options),
  );
};

/** 응답 뒤에 초안 이미지 정리 (정리 실패가 저장·게시 결과를 바꾸지 않음) */
export const scheduleDraftImageCleanup = (draftId: string) => {
  after(() => cleanupDraftImages(draftId));
};

/** 응답 뒤에 모아 둔 이미지 파일과 행 삭제 (초안 삭제 때: 유예 없음) */
export const scheduleDraftImageRemoval = (images: ImageRef[]) => {
  if (images.length === 0) {
    return;
  }

  after(() => removeDraftImages(images));
};
