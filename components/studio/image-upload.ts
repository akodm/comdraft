import type { JSONContent } from '@tiptap/core';
import type {
  FinalizeImageUploadResult,
  RequestImageUploadResult,
} from '@/lib/actions/images';
import {
  checkImageFile,
  collectImageSrcs,
  IMAGE_MAX_PER_DRAFT,
  removeDisallowedImages,
} from '@/lib/images/rules';

/**
 * 편집기 이미지 올리기의 순수 함수 (Lingui·React 없음, 테스트 대상)
 * - 대기 목록·편집기 연동은 hooks/use-pending-images.ts
 */

export interface UploadedImage {
  src: string;
  width: number;
  height: number;
}

// 이미지 넣기를 막은 사유 (형식·크기 검사와 장 수 상한)
export type ImageRejection = 'heic' | 'type' | 'size' | 'limit';

export type ImageUploadOutcome =
  | ({ status: 'ok' } & UploadedImage)
  | { status: 'unsupported'; reason: 'heic' | 'type' | 'too_large' }
  // 장 수 상한: blob 은 그대로 두고 안내 (다른 이미지를 지우면 다음 시도 때 올라감)
  | { status: 'limit' }
  // AI 작성 잠금 또는 초안 없음: 이번 차례는 그만 올리고 blob 은 그대로 둠 (안내 없음)
  | { status: 'stopped' }
  // 요청·올리기 실패: blob 은 그대로 두고 잠시 뒤·다음 자동 저장 때 다시 시도
  | { status: 'failed' };

export interface ImageUploadDeps {
  request: (
    repositoryId: string,
    draftId: string,
  ) => Promise<RequestImageUploadResult>;
  // 임시 버킷에 원본 올리기 (성공 여부)
  upload: (path: string, token: string, file: File) => Promise<boolean>;
  finalize: (
    repositoryId: string,
    draftId: string,
    uploadId: string,
  ) => Promise<FinalizeImageUploadResult>;
}

export const isBlobSrc = (src: string) => src.startsWith('blob:');

/** 파일 이름에서 마지막 확장자를 뺀 대체 글 (점으로 시작하는 이름은 그대로) */
export const getImageAlt = (fileName: string) =>
  fileName
    .trim()
    .replace(/(?<=.)\.[^./\\]+$/, '')
    .trim();

// 저장 뒤에도 편집기에 남은(못 올린) blob 이미지를 다시 올려 저장하기까지 기다리는 시간과 blob 한 장당 횟수
export const IMAGE_RETRY_DELAY = 8000;
export const IMAGE_RETRY_MAX_ATTEMPTS = 3;

/**
 * 저장 뒤 편집기에 남은 blob 이미지를 다시 올릴지와 갱신한 시도 횟수 (입력 Map 은 바꾸지 않음)
 * - 남은 blob 마다 횟수를 하나씩 올리고, 아직 다 쓰지 않은 blob 이 하나라도 있으면 다시 시도
 * - 남지 않은 blob(올라갔거나 지운 것)의 횟수는 버림 / 새로 입력하면 호출하는 쪽이 횟수를 비움
 */
export const planImageRetry = (
  blobSrcs: string[],
  attempts: ReadonlyMap<string, number>,
): { retry: boolean; attempts: Map<string, number> } => {
  const next = new Map<string, number>();
  let retry = false;

  for (const src of blobSrcs) {
    const count = attempts.get(src) ?? 0;

    if (count < IMAGE_RETRY_MAX_ATTEMPTS) {
      retry = true;
      next.set(src, count + 1);
    } else {
      next.set(src, count);
    }
  }

  return { retry, attempts: next };
};

/** 본문의 blob: 이미지 주소 (중복 없이 순서대로) */
export const collectBlobSrcs = (doc: JSONContent): string[] => [
  ...new Set(collectImageSrcs(doc).filter(isBlobSrc)),
];

/** 초안 하나에 더 넣을 수 있는 이미지 수 (본문의 이미지 수 기준) */
export const countImageSlots = (doc: JSONContent) =>
  Math.max(0, IMAGE_MAX_PER_DRAFT - collectImageSrcs(doc).length);

/** 넣으려는 파일 중 검사를 통과한 것을 남은 장 수까지 고르고, 막힌 파일마다 사유를 돌려줌 */
export const pickImageFiles = <
  T extends { name: string; type: string; size: number },
>(
  files: T[],
  slots: number,
) => {
  const accepted: T[] = [];
  const rejections: ImageRejection[] = [];

  for (const file of files) {
    const check = checkImageFile(file);

    if (!check.ok) {
      rejections.push(check.reason);
    } else if (accepted.length >= slots) {
      rejections.push('limit');
    } else {
      accepted.push(file);
    }
  }

  return { accepted, rejections };
};

// 올린 blob 이미지의 주소와 크기를 바꾼 문서 (입력은 바꾸지 않음)
const replaceUploaded = (
  node: JSONContent,
  uploaded: ReadonlyMap<string, UploadedImage>,
): JSONContent => {
  if (node.type === 'image' && typeof node.attrs?.src === 'string') {
    const result = uploaded.get(node.attrs.src);

    return result ? { ...node, attrs: { ...node.attrs, ...result } } : node;
  }

  if (!Array.isArray(node.content)) {
    return node;
  }

  return {
    ...node,
    content: node.content.map((child) => replaceUploaded(child, uploaded)),
  };
};

/**
 * 저장할 본문: 올린 blob 이미지는 공개 주소로 바꾸고, 아직 못 올린 blob 이미지는 뺌
 * (서버도 허용 주소가 아닌 이미지를 지우지만, 깨진 주소를 보내지 않도록 여기서 먼저 뺌)
 */
export const toSavableContent = (
  doc: JSONContent,
  uploaded: ReadonlyMap<string, UploadedImage>,
): JSONContent =>
  removeDisallowedImages(
    replaceUploaded(doc, uploaded),
    (src) => !isBlobSrc(src),
  );

/**
 * 이미지 한 장 올리기: 주소 발급 → 임시 버킷에 원본 올리기 → 변환 마무리
 * - 서버 액션이 던지거나 네트워크가 끊겨도 던지지 않고 failed
 */
export const uploadImageFile = async (
  deps: ImageUploadDeps,
  repositoryId: string,
  draftId: string,
  file: File,
): Promise<ImageUploadOutcome> => {
  try {
    const ticket = await deps.request(repositoryId, draftId);

    if (ticket.status === 'limit') {
      return { status: 'limit' };
    }

    if (ticket.status !== 'ok') {
      return { status: 'stopped' };
    }

    if (!(await deps.upload(ticket.path, ticket.token, file))) {
      return { status: 'failed' };
    }

    const result = await deps.finalize(repositoryId, draftId, ticket.uploadId);

    switch (result.status) {
      case 'ok':
        return {
          status: 'ok',
          src: result.src,
          width: result.width,
          height: result.height,
        };
      case 'unsupported':
      case 'limit':
      case 'failed':
        return result;
      case 'locked':
      case 'not_found':
        return { status: 'stopped' };
    }
  } catch {
    return { status: 'failed' };
  }
};

// 이미지 차례 올리기에 필요한 대기 목록과 편집기·안내 연동 (훅이 넘기고 테스트는 가짜로 바꿈)
export interface UploadBlobsContext {
  // 이미 올린 blob → 공개 주소 (오래된 본문 스냅숏에도 같은 결과를 씀)
  uploaded: Map<string, UploadedImage>;
  // 아직 올리지 않은 blob → 원본 파일
  files: Map<string, File>;
  upload: (file: File) => Promise<ImageUploadOutcome>;
  // 편집기의 그 blob 이미지를 공개 주소로 바꾸거나(change) 지움(null)
  apply: (src: string, change: UploadedImage | null) => void;
  notify: (reason: 'failed' | 'limit' | 'heic' | 'type' | 'too_large') => void;
  revoke: (src: string) => void;
}

/**
 * blob 이미지를 차례로 올리고 결과를 편집기에 반영
 * - 이미 올린 것은 다시 올리지 않고 반영만, 원본을 잃은 것은 지움
 * - 실패·장 수 상한은 blob 과 원본을 그대로 두고 안내 (다음 시도 때 다시 올림)
 * - 서버가 거부한 형식·해상도는 안내 후 지움, AI 작성 잠금·초안 없음이면 남은 것도 이번에는 멈춤
 * - blob 주소는 편집기가 공개 주소로 바뀌거나 이미지가 지워진 뒤에만 놓음
 */
export const uploadBlobs = async (
  srcs: string[],
  context: UploadBlobsContext,
): Promise<void> => {
  const { uploaded, files, upload, apply, notify, revoke } = context;

  for (const src of srcs) {
    const done = uploaded.get(src);

    if (done) {
      apply(src, done);
      continue;
    }

    const file = files.get(src);

    if (!file) {
      apply(src, null);
      continue;
    }

    const outcome = await upload(file);

    if (outcome.status === 'stopped') {
      return;
    }

    if (outcome.status === 'failed' || outcome.status === 'limit') {
      notify(outcome.status);
      continue;
    }

    files.delete(src);

    if (outcome.status === 'ok') {
      const result = {
        src: outcome.src,
        width: outcome.width,
        height: outcome.height,
      };

      uploaded.set(src, result);
      apply(src, result);
    } else {
      notify(outcome.reason);
      apply(src, null);
    }

    revoke(src);
  }
};
