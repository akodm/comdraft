import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { convertToWebp, UnsupportedImageError } from '@/lib/images/convert';

// server-only 는 서버 컴포넌트 밖에서 import 하면 던지므로 테스트에서는 비운다
vi.mock('server-only', () => ({}));

const background = { r: 200, g: 80, b: 40 };

function solid(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background },
  });
}

async function reasonOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(UnsupportedImageError);
  return (error as UnsupportedImageError).reason;
}

describe('convertToWebp', () => {
  it('큰 PNG 는 WebP 로 바꾸고 가로 1280 으로 줄인다', async () => {
    const input = await solid(2000, 1000).png().toBuffer();
    const result = await convertToWebp(input);
    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe('webp');
    expect(result.width).toBe(1280);
    expect(result.height).toBe(640);
    expect(meta.width).toBe(1280);
    expect(result.bytes).toBe(result.data.length);
  });

  it('작은 이미지는 키우지 않는다', async () => {
    const input = await solid(300, 200).jpeg().toBuffer();
    const result = await convertToWebp(input);
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it('EXIF 회전을 반영하고 메타데이터를 남기지 않는다', async () => {
    const input = await solid(400, 200)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const result = await convertToWebp(input);
    const meta = await sharp(result.data).metadata();
    expect(result.width).toBe(200);
    expect(result.height).toBe(400);
    expect(meta.exif).toBeUndefined();
  });

  it('애니메이션 GIF 는 프레임을 유지하고 높이는 한 프레임 높이다', async () => {
    const frame = (color: { r: number; g: number; b: number }) =>
      sharp({
        create: { width: 40, height: 30, channels: 3, background: color },
      })
        .png()
        .toBuffer();
    const frames = await Promise.all([
      frame({ r: 255, g: 0, b: 0 }),
      frame({ r: 0, g: 255, b: 0 }),
      frame({ r: 0, g: 0, b: 255 }),
    ]);
    const input = await sharp(frames, { join: { animated: true } })
      .gif()
      .toBuffer();
    const result = await convertToWebp(input);
    const meta = await sharp(result.data, { animated: true }).metadata();
    expect(meta.pages).toBe(3);
    expect(result.height).toBe(30);
    expect(result.width).toBe(40);
  });

  it('이미지가 아닌 바이트는 type 으로 거부한다', async () => {
    expect(await reasonOf(convertToWebp(Buffer.from('not an image')))).toBe(
      'type',
    );
  });

  it('SVG 는 type 으로 거부한다', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    );
    expect(await reasonOf(convertToWebp(svg))).toBe('type');
  });

  it('허용 형식이 아닌 이미지(TIFF)는 type 으로 거부한다', async () => {
    const input = await solid(10, 10).tiff().toBuffer();
    expect(await reasonOf(convertToWebp(input))).toBe('type');
  });

  it('픽셀 수가 한도를 넘으면 too_large 로 거부한다', async () => {
    const input = await solid(8000, 6000)
      .png({ compressionLevel: 1 })
      .toBuffer();
    expect(await reasonOf(convertToWebp(input))).toBe('too_large');
  });
});
