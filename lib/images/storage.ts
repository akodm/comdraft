import 'server-only';
import {
  IMAGE_BUCKET,
  IMAGE_UPLOAD_BUCKET,
  selectExpiredUploads,
} from '@/lib/images/rules';
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

// 한 번에 나열·삭제하는 파일 수 (Supabase Storage list 의 최대 개수)
const LIST_PAGE_SIZE = 1000;

/**
 * 회원의 이미지 폴더({userId}/) 비우기: 공개 버킷의 변환본과 임시 버킷의 원본 모두
 * - 탈퇴할 때 사용, 실패하면 false (회원 데이터 삭제와 별개로 다시 시도할 수 있음)
 */
export async function removeUserImageFolders(userId: string): Promise<boolean> {
  const storage = getServerSupabase().storage;
  let ok = true;

  for (const bucket of [IMAGE_BUCKET, IMAGE_UPLOAD_BUCKET]) {
    // 지운 만큼 목록이 줄어들므로 매번 처음부터 다시 나열
    for (;;) {
      const { data, error } = await storage
        .from(bucket)
        .list(userId, { limit: LIST_PAGE_SIZE });

      if (error) {
        ok = false;
        break;
      }

      if (!data || data.length === 0) {
        break;
      }

      const { error: removeError } = await storage
        .from(bucket)
        .remove(data.map(({ name }) => `${userId}/${name}`));

      if (removeError) {
        ok = false;
        break;
      }

      if (data.length < LIST_PAGE_SIZE) {
        break;
      }
    }
  }

  return ok;
}

type UploadBucket = ReturnType<
  ReturnType<typeof getServerSupabase>['storage']['from']
>;
// 목록 항목 (storage-js 를 직접 의존하지 않도록 list 의 반환 형식에서 꺼냄)
type FileObject = NonNullable<
  Awaited<ReturnType<UploadBucket['list']>>['data']
>[number];

// 임시 버킷의 한 폴더(prefix)를 끝까지 나열 (목록을 다 모은 뒤 지우므로 offset 으로 넘겨도 빠지지 않음)
async function listAllUploads(
  bucket: UploadBucket,
  prefix: string,
): Promise<FileObject[]> {
  const objects: FileObject[] = [];

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await bucket.list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      throw new Error(`임시 원본 목록 조회 실패: ${error.message}`);
    }

    objects.push(...(data ?? []));

    if (!data || data.length < LIST_PAGE_SIZE) {
      return objects;
    }
  }
}

/**
 * 임시 버킷에서 만든 지 1시간이 지난 원본 삭제 (마무리하지 않고 남은 원본)
 * - 원본 경로는 {userId}/{uploadId}: 맨 위의 사용자 폴더를 나열한 뒤 폴더마다 오래된 파일을 지움
 * - 목록 조회·삭제가 실패하면 던짐 (다음 정리 때 다시 시도)
 * @returns 지운 파일 수
 */
export async function removeExpiredUploads(now = new Date()): Promise<number> {
  const bucket = getServerSupabase().storage.from(IMAGE_UPLOAD_BUCKET);
  const entries = await listAllUploads(bucket, '');
  // 폴더는 id 가 없음 / 맨 위에 바로 놓인 파일도 같은 규칙으로 지움
  const folders = entries.filter(({ id }) => !id).map(({ name }) => name);
  const targets = selectExpiredUploads(entries, now);

  for (const folder of folders) {
    const files = await listAllUploads(bucket, folder);

    targets.push(
      ...selectExpiredUploads(files, now).map((name) => `${folder}/${name}`),
    );
  }

  let removed = 0;

  for (let start = 0; start < targets.length; start += LIST_PAGE_SIZE) {
    const chunk = targets.slice(start, start + LIST_PAGE_SIZE);
    const { data, error } = await bucket.remove(chunk);

    if (error) {
      throw new Error(`임시 원본 삭제 실패: ${error.message}`);
    }

    removed += data?.length ?? chunk.length;
  }

  return removed;
}
