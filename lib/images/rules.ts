import type { JSONContent } from '@tiptap/core';

// 클라이언트와 서버가 함께 쓰는 순수 규칙 모듈 (브라우저에서도 불러오므로 server-only 를 붙이지 않고, Lingui 도 쓰지 않음)

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
/**
 * 쓰지 않게 된 이미지를 지우기 전에 두는 유예 (마지막으로 저장된 본문에 있던 시각부터)
 * - 방금 올린 이미지가 본문 저장 전에, 잘라 낸 이미지가 다시 붙여 넣기 전에 지워지지 않도록
 */
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

/**
 * 허용된 주소면 버킷 안 경로를, 아니면 null (정해진 접두사 뒤가 `{uuid}.webp` 한 조각일 때만 허용)
 * - 기준 주소나 사용자 id 가 비었거나 사용자 id 에 `/` 가 있으면 접두사가 무너지므로 거부
 */
export function parseImagePath(
  supabaseUrl: string,
  src: string,
  userId: string,
): string | null {
  const base = trimTrailingSlash(supabaseUrl);
  if (!base || !userId || userId.includes('/')) return null;
  const prefix = `${base}${PUBLIC_PATH_PREFIX}${userId}/`;
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

// 비어도 스키마에 맞는 글자 블록 (이미지를 빼서 비어도 지우지 않음: 목록 항목의 첫 문단 자리 등)
const TEXTBLOCK_TYPES = new Set(['paragraph', 'heading', 'codeBlock']);

function isNodeObject(value: unknown): value is JSONContent {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 자식 목록에서 허용 안 되는 이미지를 지운 결과 (객체가 아닌 자식은 그대로 둠)
function filterChildren(
  children: JSONContent[],
  allow: (src: string) => boolean,
): JSONContent[] {
  return children.flatMap((child) => {
    if (!isNodeObject(child)) return [child];
    const filtered = filterNode(child, allow);
    return filtered ? [filtered] : [];
  });
}

// 노드 하나 정리 (지울 노드면 null)
function filterNode(
  node: JSONContent,
  allow: (src: string) => boolean,
): JSONContent | null {
  if (node.type === 'image') {
    const src = node.attrs?.src;
    if (typeof src !== 'string' || !allow(src)) return null;
    return { type: 'image', attrs: sanitizeImageAttrs(node.attrs ?? {}, src) };
  }
  if (!Array.isArray(node.content) || node.content.length === 0) return node;

  const content = filterChildren(node.content, allow);
  if (content.length > 0) return { ...node, content };

  // 이미지를 빼서 비게 됨: 글자 블록은 빈 채로 남기고, 그 밖의 묶음(목록 항목, 목록, 인용, 빈칸)은 지움
  if (node.type && TEXTBLOCK_TYPES.has(node.type)) {
    const emptied = { ...node };
    delete emptied.content;
    return emptied;
  }
  return null;
}

/**
 * 허용되지 않는 image 노드를 (중첩 포함) 제거하고, 남는 image 노드는 type 과 정리한 attrs 만 남김 (입력은 변경하지 않음)
 * - 문서 스키마를 지키도록, 이미지를 빼서 비게 된 묶음 노드(목록 항목, 목록, 인용 등)는 지우고 그 부모도 비면 함께 지움
 * - 글자 블록(문단, 제목, 코드)은 비어도 스키마에 맞으므로 남김
 * - 그렇게 해서 문서가 비면 빈 문단 하나를 남김 (원래 비어 있던 문서는 그대로)
 */
export function removeDisallowedImages(
  doc: JSONContent,
  allow: (src: string) => boolean,
): JSONContent {
  if (!Array.isArray(doc.content) || doc.content.length === 0) return doc;
  const content = filterChildren(doc.content, allow);
  return {
    ...doc,
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

/** 본문(중첩 포함)의 image 노드 src 를 순서대로 모음 (저장된 본문의 잘못된 자식은 건너뜀) */
export function collectImageSrcs(doc: JSONContent | null): string[] {
  const srcs: string[] = [];
  const walk = (node: unknown) => {
    if (!isNodeObject(node)) return;
    if (node.type === 'image' && typeof node.attrs?.src === 'string')
      srcs.push(node.attrs.src);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(doc);
  return srcs;
}

/**
 * 여러 본문(중첩 포함)에 든 그 사용자의 공개 버킷 경로 (중복 없이, 본문 순서대로)
 * - 다른 사용자 경로, 외부 주소, blob 은 넣지 않음 / 빈 본문(null)은 건너뜀
 * - 본문을 바꿔 저장할 때 바뀌기 전 본문과 새 본문을 함께 넘기면 마지막 사용 시각을 갱신할 경로가 됨
 */
export function collectOwnImagePaths(
  contents: unknown[],
  supabaseUrl: string,
  userId: string,
): Set<string> {
  return new Set(
    contents
      .flatMap((content) => collectImageSrcs(content as JSONContent | null))
      .flatMap((src) => {
        const path = parseImagePath(supabaseUrl, src, userId);
        return path ? [path] : [];
      }),
  );
}

/**
 * 본문에서 안 쓰이는 이미지 중 정리 대상 (초안 삭제 때는 grace: false)
 * - 기본은 마지막 사용 시각(lastUsedAt: 올린 시각, 또는 그 이미지가 든 본문을 마지막으로 저장한 시각)이 유예 이전인 것만
 */
export function findUnusedImages(
  images: Array<{ id: string; path: string; lastUsedAt: Date }>,
  usedPaths: Set<string>,
  now: Date,
  options: { grace: boolean } = { grace: true },
): Array<{ id: string; path: string }> {
  const threshold = now.getTime() - IMAGE_CLEANUP_GRACE_MS;
  return images
    .filter((image) => !usedPaths.has(image.path))
    .filter(
      (image) => !options.grace || image.lastUsedAt.getTime() <= threshold,
    )
    .map(({ id, path }) => ({ id, path }));
}

/**
 * 초안 하나를 정리할 때의 후보
 * - 그 초안의 행: 본문에서 안 쓰고 유예가 지난 것 (options 그대로, 초안 삭제 때는 grace: false)
 * - 초안이 지워져 draft_id 가 빈 그 사용자의 행: 같은 규칙이지만 유예는 항상 둠
 */
export function findCleanupCandidates(
  draftImages: Array<{ id: string; path: string; lastUsedAt: Date }>,
  orphanImages: Array<{ id: string; path: string; lastUsedAt: Date }>,
  usedPaths: Set<string>,
  now: Date,
  options: { grace: boolean } = { grace: true },
): Array<{ id: string; path: string }> {
  return [
    ...findUnusedImages(draftImages, usedPaths, now, options),
    ...findUnusedImages(orphanImages, usedPaths, now, { grace: true }),
  ];
}

/** 같은 사용자의 다른 초안·게시글이 쓰는 경로를 뺌 (초안 사이에 복사한 이미지를 지우지 않도록) */
export function excludeReferencedImages<T extends { path: string }>(
  images: T[],
  referencedPaths: Set<string>,
): T[] {
  return images.filter((image) => !referencedPaths.has(image.path));
}
