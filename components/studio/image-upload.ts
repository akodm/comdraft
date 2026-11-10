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
  | { status: 'limit' }
  // AI 작성 잠금 또는 초안 없음: 이번 차례는 그만 올리고 blob 은 그대로 둠 (안내 없음)
  | { status: 'stopped' }
  // 요청·올리기 실패: blob 은 그대로 두고 다음 자동 저장 때 다시 시도
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
