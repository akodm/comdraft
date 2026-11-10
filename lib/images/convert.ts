import 'server-only';
import sharp, {
  type Metadata,
  type OutputInfo,
  type SharpOptions,
} from 'sharp';
import {
  IMAGE_ACCEPTED_SHARP_FORMATS,
  IMAGE_MAX_INPUT_PIXELS,
  IMAGE_MAX_WIDTH,
  IMAGE_WEBP_QUALITY,
} from '@/lib/images/rules';

export type UnsupportedImageReason = 'heic' | 'type' | 'too_large';

export class UnsupportedImageError extends Error {
  constructor(public readonly reason: UnsupportedImageReason) {
    super(`지원하지 않는 이미지입니다: ${reason}`);
    this.name = 'UnsupportedImageError';
  }
}

export interface ConvertedImage {
  data: Buffer;
  width: number;
  height: number;
  bytes: number;
}

// WebP 가 담을 수 있는 가로·세로 최대 크기
const WEBP_MAX_DIMENSION = 16383;
// sharp 의 픽셀 한도 초과, WebP 최대 크기 초과 오류 문구
const TOO_LARGE_MESSAGE = /pixel limit|too large for the webp format/i;

function isTooLargeError(error: unknown): boolean {
  return error instanceof Error && TOO_LARGE_MESSAGE.test(error.message);
}

/** 형식 판별 (sharp 는 AVIF 를 heif + av1, HEIC 를 heif + hevc 로 보고한다) */
function assertAcceptedFormat(meta: Metadata): void {
  const { format, compression } = meta;
  if (format === 'heif') {
    if (compression === 'av1') return;
    throw new UnsupportedImageError(compression === 'hevc' ? 'heic' : 'type');
  }
  if (
    !format ||
    !(IMAGE_ACCEPTED_SHARP_FORMATS as readonly string[]).includes(format)
  ) {
    throw new UnsupportedImageError('type');
  }
}

/** 애니메이션은 프레임마다 따로 세는 sharp 한도를 피하지 못하므로 전체 픽셀로 다시 검사 */
function assertWithinPixelLimit(meta: Metadata): void {
  const frameHeight = meta.pageHeight ?? meta.height ?? 0;
  const total = (meta.width ?? 0) * frameHeight * (meta.pages ?? 1);
  if (total > IMAGE_MAX_INPUT_PIXELS) {
    throw new UnsupportedImageError('too_large');
  }
}

/**
 * 회전·축소 뒤 한 프레임이 WebP 최대 크기(16383px)를 넘으면 거부 (넘으면 sharp 가 변환 중에 던짐)
 * - EXIF 방향 5~8 은 가로·세로가 바뀜, 가로는 IMAGE_MAX_WIDTH 까지 줄이고 세로는 같은 비율로
 */
function assertWithinWebpDimension(meta: Metadata): void {
  const width = meta.width ?? 0;
  const frameHeight = meta.pageHeight ?? meta.height ?? 0;
  const [outWidth, outHeight] =
    (meta.orientation ?? 1) >= 5 ? [frameHeight, width] : [width, frameHeight];
  const scale = outWidth > 0 ? Math.min(1, IMAGE_MAX_WIDTH / outWidth) : 1;
  if (
    Math.round(outWidth * scale) > WEBP_MAX_DIMENSION ||
    Math.round(outHeight * scale) > WEBP_MAX_DIMENSION
  ) {
    throw new UnsupportedImageError('too_large');
  }
}

async function readMetadata(
  input: Buffer,
  options: SharpOptions,
): Promise<Metadata> {
  try {
    return await sharp(input, options).metadata();
  } catch (error) {
    // 입력을 읽지 못한 경우만 거부 사유로 바꾼다
    throw new UnsupportedImageError(
      isTooLargeError(error) ? 'too_large' : 'type',
    );
  }
}

/**
 * 업로드된 이미지를 실제 형식 검사 후 WebP 로 변환 (회전 반영, 메타데이터 제거, 애니메이션 유지)
 * - 이 함수의 오류는 모두 UnsupportedImageError (입력 때문이라 다시 시도해도 같음)
 */
export async function convertToWebp(input: Buffer): Promise<ConvertedImage> {
  const options: SharpOptions = {
    animated: true,
    limitInputPixels: IMAGE_MAX_INPUT_PIXELS,
  };
  const meta = await readMetadata(input, options);
  assertAcceptedFormat(meta);
  assertWithinPixelLimit(meta);
  assertWithinWebpDimension(meta);

  let result: { data: Buffer; info: OutputInfo };
  try {
    result = await sharp(input, options)
      .rotate()
      .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: IMAGE_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    // sharp 변환 오류(잘린 파일, 깨진 데이터 등)는 입력에 따라 정해져 다시 해도 같으므로 failed 가 아닌 거부 사유로
    throw new UnsupportedImageError(
      isTooLargeError(error) ? 'too_large' : 'type',
    );
  }

  // 애니메이션은 프레임이 세로로 이어진 전체 높이이므로 프레임 수로 나눈다 (정지 이미지는 pages 없음)
  const { data, info } = result;
  return {
    data,
    width: info.width,
    height: Math.round(info.height / (info.pages ?? 1)),
    bytes: data.length,
  };
}
