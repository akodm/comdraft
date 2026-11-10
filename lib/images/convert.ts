import 'server-only';
import sharp from 'sharp';
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

const PIXEL_LIMIT_MESSAGE = /pixel limit/i;

/** sharp 오류를 거부 사유로 바꾼다 (알 수 없는 오류는 읽을 수 없는 이미지로 본다) */
function toUnsupportedError(error: unknown): UnsupportedImageError {
  if (error instanceof UnsupportedImageError) return error;
  if (error instanceof Error && PIXEL_LIMIT_MESSAGE.test(error.message)) {
    return new UnsupportedImageError('too_large');
  }
  return new UnsupportedImageError('type');
}

function assertAcceptedFormat(format: string | undefined): void {
  if (format === 'heif') throw new UnsupportedImageError('heic');
  if (
    !format ||
    !(IMAGE_ACCEPTED_SHARP_FORMATS as readonly string[]).includes(format)
  ) {
    throw new UnsupportedImageError('type');
  }
}

/** 업로드된 이미지를 실제 형식 검사 후 WebP 로 변환 (회전 반영, 메타데이터 제거, 애니메이션 유지) */
export async function convertToWebp(input: Buffer): Promise<ConvertedImage> {
  try {
    const options = {
      animated: true,
      limitInputPixels: IMAGE_MAX_INPUT_PIXELS,
    };
    const meta = await sharp(input, options).metadata();
    assertAcceptedFormat(meta.format);

    const { data, info } = await sharp(input, options)
      .rotate()
      .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: IMAGE_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    // 애니메이션은 모든 프레임이 세로로 이어진 높이라서 한 프레임 높이로 환산
    const pages = info.pages ?? 1;
    return {
      data,
      width: info.width,
      height: Math.round(info.height / pages),
      bytes: data.length,
    };
  } catch (error) {
    throw toUnsupportedError(error);
  }
}
