import type { JSONContent } from '@tiptap/core';

// 클라이언트와 서버가 함께 쓰는 순수 규칙 모듈 (server-only, Lingui 사용 금지)

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_PER_DRAFT = 10;
export const IMAGE_ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;
/**
 * sharp 가 판별한 실제 형식 중 허용하는 것.
 * AVIF 는 sharp 에서 `heif` + 압축 `av1` 로 보고되므로 여기 없고 convert 에서 따로 허용한다.
 */
export const IMAGE_ACCEPTED_SHARP_FORMATS = [
  'jpeg',
  'png',
  'webp',
  'gif',
] as const;
export const IMAGE_MAX_WIDTH = 1280;
export const IMAGE_WEBP_QUALITY = 80;
export const IMAGE_MAX_INPUT_PIXELS = 40_000_000;
/** 방금 올린 이미지가 본문 저장 전에 지워지지 않도록 두는 유예 */
export const IMAGE_CLEANUP_GRACE_MS = 10 * 60 * 1000;
export const IMAGE_BUCKET = 'comdraft-images';
export const IMAGE_UPLOAD_BUCKET = 'comdraft-uploads';

const IMAGE_ALT_MAX_LENGTH = 200;
const PUBLIC_PATH_PREFIX = `/storage/v1/object/public/${IMAGE_BUCKET}/`;
const IMAGE_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);
const HEIC_EXTENSION_PATTERN = /\.(heic|heif)$/i;

export type ImageFileCheck =
  | { ok: true }
  | { ok: false; reason: 'heic' | 'type' | 'size' };

/** 올리기 전 파일 검사 (HEIC 가 가장 먼저, 그다음 형식, 크기 순) */
export function checkImageFile(file: {
  type: string;
  name: string;
  size: number;
}): ImageFileCheck {
  if (
    HEIC_MIME_TYPES.has(file.type.toLowerCase()) ||
    HEIC_EXTENSION_PATTERN.test(file.name)
  ) {
    return { ok: false, reason: 'heic' };
  }
  if (
    !(IMAGE_ACCEPTED_MIME_TYPES as readonly string[]).includes(
      file.type.toLowerCase(),
    )
  ) {
    return { ok: false, reason: 'type' };
  }
  if (file.size > IMAGE_MAX_BYTES) return { ok: false, reason: 'size' };
  return { ok: true };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 경로에 쓰기 전 UUID 형식 검사 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** 공개 버킷 안 경로 */
export function getImagePath(userId: string, imageId: string): string {
  return `${userId}/${imageId}.webp`;
}

/** 임시 버킷 안 경로 */
export function getUploadPath(userId: string, uploadId: string): string {
  return `${userId}/${uploadId}`;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getImagePublicUrl(supabaseUrl: string, path: string): string {
  return `${trimTrailingSlash(supabaseUrl)}${PUBLIC_PATH_PREFIX}${path}`;
}

/** 허용된 주소면 버킷 안 경로를, 아니면 null (정해진 접두사 뒤가 `{uuid}.webp` 한 조각일 때만 허용) */
export function parseImagePath(
  supabaseUrl: string,
  src: string,
  userId: string,
): string | null {
  const prefix = `${trimTrailingSlash(supabaseUrl)}${PUBLIC_PATH_PREFIX}${userId}/`;
  if (!src.startsWith(prefix)) return null;
  const file = src.slice(prefix.length);
  if (!IMAGE_FILE_PATTERN.test(file)) return null;
  return `${userId}/${file}`;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** 허용된 이미지 노드의 속성을 src/alt/width/height 만 남기고 정리 */
function sanitizeImageAttrs(
  attrs: Record<string, unknown>,
  src: string,
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = { src };
  if (typeof attrs.alt === 'string')
    cleaned.alt = attrs.alt.slice(0, IMAGE_ALT_MAX_LENGTH);
  if (isPositiveInteger(attrs.width)) cleaned.width = attrs.width;
  if (isPositiveInteger(attrs.height)) cleaned.height = attrs.height;
  return cleaned;
}

/** 허용되지 않는 image 노드를 (중첩 포함) 제거하고, 남는 image 노드의 속성을 정리 (입력은 변경하지 않음) */
export function removeDisallowedImages(
  doc: JSONContent,
  allow: (src: string) => boolean,
): JSONContent {
  if (!doc.content) return doc;
  const content: JSONContent[] = [];
  for (const node of doc.content) {
    if (node.type === 'image') {
      const src = node.attrs?.src;
      if (typeof src === 'string' && allow(src)) {
        content.push({
          ...node,
          attrs: sanitizeImageAttrs(node.attrs ?? {}, src),
        });
      }
      continue;
    }
    content.push(removeDisallowedImages(node, allow));
  }
  return { ...doc, content };
}

/** 본문(중첩 포함)의 image 노드 src 를 순서대로 모음 */
export function collectImageSrcs(doc: JSONContent | null): string[] {
  if (!doc) return [];
  const srcs: string[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string')
      srcs.push(node.attrs.src);
    node.content?.forEach(walk);
  };
  walk(doc);
  return srcs;
}

/** 본문에서 안 쓰이는 이미지 중 정리 대상 (기본은 유예 이전에 만든 것만, 초안 삭제 때는 grace: false) */
export function findUnusedImages(
  images: Array<{ id: string; path: string; createdAt: Date }>,
  usedPaths: Set<string>,
  now: Date,
  options: { grace: boolean } = { grace: true },
): Array<{ id: string; path: string }> {
  const threshold = now.getTime() - IMAGE_CLEANUP_GRACE_MS;
  return images
    .filter((image) => !usedPaths.has(image.path))
    .filter((image) => !options.grace || image.createdAt.getTime() <= threshold)
    .map(({ id, path }) => ({ id, path }));
}
