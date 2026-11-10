import 'server-only';
import { IMAGE_BUCKET, IMAGE_UPLOAD_BUCKET } from '@/lib/images/rules';
import { getServerSupabase } from '@/lib/supabase/server';

// 이미지 Storage 호출 모음 (임시 버킷: 원본, 공개 버킷: 변환본)

const IMAGE_CACHE_CONTROL = '31536000';

/** 임시 버킷에 직접 올릴 수 있는 서명 주소 (브라우저가 uploadToSignedUrl 로 사용) */
export async function createUploadUrl(
  path: string,
): Promise<{ signedUrl: string; token: string }> {
  const { data, error } = await getServerSupabase()
    .storage.from(IMAGE_UPLOAD_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(`업로드 주소 발급 실패: ${error?.message ?? 'no data'}`);
  }

  return { signedUrl: data.signedUrl, token: data.token };
}

/** 임시 버킷의 원본 내려받기 */
export async function downloadUpload(path: string): Promise<Buffer> {
  const { data, error } = await getServerSupabase()
    .storage.from(IMAGE_UPLOAD_BUCKET)
    .download(path);

  if (error || !data) {
    throw new Error(`원본 내려받기 실패: ${error?.message ?? 'no data'}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

/** 임시 버킷의 원본 삭제 (실패해도 던지지 않음: 정리는 다음 기회에) */
export async function removeUploads(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { error } = await getServerSupabase()
    .storage.from(IMAGE_UPLOAD_BUCKET)
    .remove(paths);
  return !error;
}

/** 공개 버킷에 변환본 올리기 (덮어쓰지 않음) */
export async function putImage(path: string, data: Buffer): Promise<void> {
  const { error } = await getServerSupabase()
    .storage.from(IMAGE_BUCKET)
    .upload(path, data, {
      contentType: 'image/webp',
      upsert: false,
      cacheControl: IMAGE_CACHE_CONTROL,
    });

  if (error) {
    throw new Error(`이미지 업로드 실패: ${error.message}`);
  }
}

/** 공개 버킷의 변환본 삭제 @returns 성공 여부 */
export async function removeImages(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { error } = await getServerSupabase()
    .storage.from(IMAGE_BUCKET)
    .remove(paths);
  return !error;
}
