import 'server-only';
import { incrementRateLimit } from '@/lib/rate-limit';

/**
 * 사용자당 이미지 올리기 횟수 제한 (서명 주소 남발·sharp 변환 남용 방지)
 * - 서명 주소 발급과 변환 마무리를 따로 셈: 각각 1시간에 30회까지
 * - 거절된 시도도 셈 (먼저 올리고 비교)
 */
export const IMAGE_UPLOAD_HOURLY_LIMIT = 30;
const IMAGE_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

export type ImageUploadAttempt = 'upload-url' | 'finalize';

const KEY_PREFIX: Record<ImageUploadAttempt, string> = {
  'upload-url': 'image-upload-url',
  finalize: 'image-finalize',
};

// 이번 시도를 세고 한도 안이면 true
export async function consumeImageUploadAttempt(
  kind: ImageUploadAttempt,
  userId: string,
): Promise<boolean> {
  const count = await incrementRateLimit(
    `${KEY_PREFIX[kind]}:${userId}`,
    IMAGE_UPLOAD_WINDOW_MS,
  );

  return count <= IMAGE_UPLOAD_HOURLY_LIMIT;
}
