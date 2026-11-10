'use server';

import { count, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { image } from '@/lib/db/schema';
import { isDraftEditLocked } from '@/lib/generation/jobs';
import { convertToWebp, UnsupportedImageError } from '@/lib/images/convert';
import {
  getImagePath,
  getImagePublicUrl,
  getUploadPath,
  IMAGE_MAX_PER_DRAFT,
  isUuid,
} from '@/lib/images/rules';
import {
  createUploadUrl,
  downloadUpload,
  putImage,
  removeImages,
  removeUploads,
} from '@/lib/images/storage';
import { getSupabaseUrl } from '@/lib/supabase/server';
import { isOwnedDraft } from '@/lib/studio/queries';

export type RequestImageUploadResult =
  | { status: 'ok'; uploadId: string; path: string; token: string }
  // 초안당 이미지 수 상한
  | { status: 'limit' }
  // AI 작성 중이라 편집 잠금
  | { status: 'locked' }
  | { status: 'not_found' };

export type FinalizeImageUploadResult =
  | { status: 'ok'; src: string; width: number; height: number }
  | { status: 'unsupported'; reason: 'heic' | 'type' | 'too_large' }
  | { status: 'limit' }
  | { status: 'locked' }
  | { status: 'not_found' }
  | { status: 'failed' };

type DraftImageGate = 'ok' | 'limit' | 'locked' | 'not_found';

// 소유, AI 작성 잠금, 장 수 상한 검사 (두 액션 공통)
const checkDraftImageGate = async (
  userId: string,
  repositoryId: string,
  draftId: string,
): Promise<DraftImageGate> => {
  if (!(await isOwnedDraft(userId, repositoryId, draftId))) {
    return 'not_found';
  }

  if (await isDraftEditLocked(draftId)) {
    return 'locked';
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(image)
    .where(eq(image.draftId, draftId));

  return total >= IMAGE_MAX_PER_DRAFT ? 'limit' : 'ok';
};

/**
 * 이미지 올리기 준비: 임시 버킷에 직접 올릴 서명 주소(token) 발급
 * - 브라우저는 uploadToSignedUrl(path, token, file) 로 원본을 올린 뒤 finalizeImageUpload 호출
 */
export async function requestImageUpload(
  repositoryId: string,
  draftId: string,
): Promise<RequestImageUploadResult> {
  const { user } = await requireSession();

  const gate = await checkDraftImageGate(user.id, repositoryId, draftId);
  if (gate !== 'ok') {
    return { status: gate };
  }

  const uploadId = crypto.randomUUID();
  const path = getUploadPath(user.id, uploadId);
  const { token } = await createUploadUrl(path);

  return { status: 'ok', uploadId, path, token };
}

/**
 * 올린 원본을 WebP 로 변환해 공개 버킷에 저장하고 기록
 * - 경로는 세션 사용자 기준으로만 만듦 (클라이언트 입력은 UUID 형식의 uploadId 뿐)
 * - 변환이 거부되면 원본을 지우고 unsupported, 그 밖의 오류는 원본을 지우고 failed
 */
export async function finalizeImageUpload(
  repositoryId: string,
  draftId: string,
  uploadId: string,
): Promise<FinalizeImageUploadResult> {
  const { user } = await requireSession();

  if (!isUuid(uploadId)) {
    return { status: 'not_found' };
  }

  const gate = await checkDraftImageGate(user.id, repositoryId, draftId);
  if (gate !== 'ok') {
    return { status: gate };
  }

  const uploadPath = getUploadPath(user.id, uploadId);

  try {
    const original = await downloadUpload(uploadPath);
    const converted = await convertToWebp(original);

    const imageId = crypto.randomUUID();
    const path = getImagePath(user.id, imageId);
    await putImage(path, converted.data);

    try {
      await db.insert(image).values({
        id: imageId,
        userId: user.id,
        draftId,
        path,
        width: converted.width,
        height: converted.height,
        bytes: converted.bytes,
      });
    } catch (error) {
      // 기록이 없는 파일이 남지 않도록 방금 올린 공개 파일 제거
      await removeImages([path]);
      throw error;
    }

    await removeUploads([uploadPath]);

    return {
      status: 'ok',
      src: getImagePublicUrl(getSupabaseUrl(), path),
      width: converted.width,
      height: converted.height,
    };
  } catch (error) {
    await removeUploads([uploadPath]);

    if (error instanceof UnsupportedImageError) {
      return { status: 'unsupported', reason: error.reason };
    }

    return { status: 'failed' };
  }
}
