'use server';

import { count, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { image } from '@/lib/db/schema';
import { isDraftEditLocked } from '@/lib/generation/jobs';
import { convertToWebp, UnsupportedImageError } from '@/lib/images/convert';
import { insertImageWithinLimit } from '@/lib/images/records';
import {
  getImagePath,
  getImagePublicUrl,
  getUploadPath,
  IMAGE_MAX_BYTES,
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
 * - 장 수 상한은 기록을 넣을 때 초안 단위 잠금 안에서 다시 세어 확정 (앞의 검사는 빠른 거절용)
 * - 변환이 거부되면 원본을 지우고 unsupported, 그 밖의 오류는 원본을 지우고 failed
 * - 원본이 IMAGE_MAX_BYTES 를 넘으면 변환하지 않고 unsupported 'too_large'
 *   (브라우저가 올리기 전에 크기를 막으므로 검사를 건너뛴 요청만 해당: 새 사유를 만들지 않고 기존 사유를 씀)
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

    if (original.length > IMAGE_MAX_BYTES) {
      throw new UnsupportedImageError('too_large');
    }

    const converted = await convertToWebp(original);

    // 이미지 id 를 업로드 id 로 써서, 같은 업로드를 동시에 두 번 마무리해도 공개 파일(upsert 없음)과
    // 기록(기본 키) 중 하나만 생기게 함. 공개 파일 올리기가 실패한 쪽은 남의 파일을 지우지 않음
    const path = getImagePath(user.id, uploadId);
    await putImage(path, converted.data);

    let inserted: boolean;

    try {
      inserted = await insertImageWithinLimit({
        id: uploadId,
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

    if (!inserted) {
      // 동시에 마무리한 다른 업로드가 마지막 자리를 차지함
      await removeImages([path]);
      await removeUploads([uploadPath]);
      return { status: 'limit' };
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
