import { describe, expect, it, vi } from 'vitest';
import {
  collectBlobSrcs,
  countImageSlots,
  getImageAlt,
  IMAGE_RETRY_MAX_ATTEMPTS,
  pickImageFiles,
  planImageRetry,
  toSavableContent,
  uploadImageFile,
  type ImageUploadDeps,
} from '@/components/studio/image-upload';

const BLOB_A = 'blob:http://localhost:3003/a';
const BLOB_B = 'blob:http://localhost:3003/b';
const PUBLIC_SRC =
  'https://x.supabase.co/storage/v1/object/public/comdraft-images/u/0b6a3c7e-0000-4000-8000-000000000000.webp';

const image = (src: string, alt = '') => ({
  type: 'image',
  attrs: { src, alt, width: null, height: null },
});

const doc = (...content: object[]) => ({ type: 'doc', content });

describe('getImageAlt', () => {
  it('파일 이름에서 마지막 확장자만 뺀다', () => {
    expect(getImageAlt('cat.png')).toBe('cat');
    expect(getImageAlt('my.photo.final.jpeg')).toBe('my.photo.final');
  });

  it('확장자가 없거나 점으로 시작하는 이름은 그대로 둔다', () => {
    expect(getImageAlt('README')).toBe('README');
    expect(getImageAlt('.png')).toBe('.png');
  });

  it('앞뒤 공백을 지운다', () => {
    expect(getImageAlt('  screen shot .png')).toBe('screen shot');
  });
});

describe('collectBlobSrcs', () => {
  it('중첩된 blob: 이미지 주소를 한 번씩 순서대로 모은다', () => {
    const content = doc(image(BLOB_A), image(PUBLIC_SRC), {
      type: 'blockquote',
      content: [image(BLOB_B), image(BLOB_A)],
    });

    expect(collectBlobSrcs(content)).toEqual([BLOB_A, BLOB_B]);
  });
});

describe('countImageSlots', () => {
  it('초안당 10장에서 본문 이미지 수를 뺀 값', () => {
    expect(countImageSlots(doc({ type: 'paragraph' }))).toBe(10);
    expect(
      countImageSlots(doc(image(BLOB_A), image(PUBLIC_SRC), image(BLOB_A))),
    ).toBe(7);
  });

  it('이미 10장을 넘었으면 0', () => {
    const many = doc(...Array.from({ length: 12 }, () => image(PUBLIC_SRC)));

    expect(countImageSlots(many)).toBe(0);
  });
});

describe('pickImageFiles', () => {
  const file = (name: string, type: string, size = 10) => ({
    name,
    type,
    size,
  });

  it('검사를 통과한 파일만 남은 장 수까지 고르고, 걸린 사유를 돌려준다', () => {
    const result = pickImageFiles(
      [
        file('a.png', 'image/png'),
        file('b.heic', ''),
        file('c.pdf', 'application/pdf'),
        file('d.png', 'image/png', 6 * 1024 * 1024),
        file('e.webp', 'image/webp'),
        file('f.gif', 'image/gif'),
      ],
      2,
    );

    expect(result.accepted.map(({ name }) => name)).toEqual([
      'a.png',
      'e.webp',
    ]);
    expect(result.rejections).toEqual(['heic', 'type', 'size', 'limit']);
  });

  it('남은 장 수가 0 이면 모두 limit', () => {
    const result = pickImageFiles([file('a.png', 'image/png')], 0);

    expect(result.accepted).toEqual([]);
    expect(result.rejections).toEqual(['limit']);
  });
});

describe('toSavableContent', () => {
  it('올린 blob 은 공개 주소와 크기로 바꾸고, 남은 blob 이미지는 뺀다', () => {
    const content = doc(
      { type: 'paragraph', content: [{ type: 'text', text: '글' }] },
      image(BLOB_A, 'cat'),
      image(BLOB_B, 'dog'),
      { type: 'blockquote', content: [image(BLOB_A, 'cat again')] },
    );
    const uploaded = new Map([
      [BLOB_A, { src: PUBLIC_SRC, width: 640, height: 480 }],
    ]);

    expect(toSavableContent(content, uploaded)).toEqual(
      doc(
        { type: 'paragraph', content: [{ type: 'text', text: '글' }] },
        {
          type: 'image',
          attrs: { src: PUBLIC_SRC, alt: 'cat', width: 640, height: 480 },
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'image',
              attrs: {
                src: PUBLIC_SRC,
                alt: 'cat again',
                width: 640,
                height: 480,
              },
            },
          ],
        },
      ),
    );
  });

  it('입력 문서는 바꾸지 않는다', () => {
    const content = doc(image(BLOB_A));
    const before = JSON.stringify(content);

    toSavableContent(
      content,
      new Map([[BLOB_A, { src: PUBLIC_SRC, width: 1, height: 1 }]]),
    );

    expect(JSON.stringify(content)).toBe(before);
  });
});

describe('uploadImageFile', () => {
  const file = new File(['x'], 'a.png', { type: 'image/png' });

  const createDeps = (
    overrides: Partial<ImageUploadDeps> = {},
  ): ImageUploadDeps => ({
    request: vi.fn(async () => ({
      status: 'ok' as const,
      uploadId: 'up-1',
      path: 'u/up-1',
      token: 'tok',
    })),
    upload: vi.fn(async () => true),
    finalize: vi.fn(async () => ({
      status: 'ok' as const,
      src: PUBLIC_SRC,
      width: 10,
      height: 20,
    })),
    ...overrides,
  });

  it('주소 발급 → 원본 올리기 → 마무리 순서로 부르고 공개 주소를 돌려준다', async () => {
    const deps = createDeps();

    await expect(uploadImageFile(deps, 'repo', 'draft', file)).resolves.toEqual(
      { status: 'ok', src: PUBLIC_SRC, width: 10, height: 20 },
    );
    expect(deps.request).toHaveBeenCalledWith('repo', 'draft');
    expect(deps.upload).toHaveBeenCalledWith('u/up-1', 'tok', file);
    expect(deps.finalize).toHaveBeenCalledWith('repo', 'draft', 'up-1');
  });

  it('주소 발급의 limit 은 그대로, locked·not_found 는 stopped', async () => {
    for (const [status, expected] of [
      ['limit', 'limit'],
      ['locked', 'stopped'],
      ['not_found', 'stopped'],
    ] as const) {
      const deps = createDeps({ request: vi.fn(async () => ({ status })) });

      await expect(
        uploadImageFile(deps, 'repo', 'draft', file),
      ).resolves.toEqual({ status: expected });
      expect(deps.upload).not.toHaveBeenCalled();
    }
  });

  it('주소 발급·올리기·마무리가 던지거나 실패하면 failed', async () => {
    const throwing = createDeps({
      request: vi.fn(async () => {
        throw new Error('network');
      }),
    });
    const notUploaded = createDeps({ upload: vi.fn(async () => false) });
    const finalizeFailed = createDeps({
      finalize: vi.fn(async () => ({ status: 'failed' as const })),
    });
    const finalizeThrows = createDeps({
      finalize: vi.fn(async () => {
        throw new Error('network');
      }),
    });

    for (const deps of [
      throwing,
      notUploaded,
      finalizeFailed,
      finalizeThrows,
    ]) {
      await expect(
        uploadImageFile(deps, 'repo', 'draft', file),
      ).resolves.toEqual({ status: 'failed' });
    }
    expect(notUploaded.finalize).not.toHaveBeenCalled();
  });

  it('마무리의 unsupported·limit 은 그대로, locked·not_found 는 stopped', async () => {
    const cases = [
      [
        { status: 'unsupported', reason: 'too_large' },
        { status: 'unsupported', reason: 'too_large' },
      ],
      [{ status: 'limit' }, { status: 'limit' }],
      [{ status: 'locked' }, { status: 'stopped' }],
      [{ status: 'not_found' }, { status: 'stopped' }],
    ] as const;

    for (const [result, expected] of cases) {
      const deps = createDeps({ finalize: vi.fn(async () => result) });

      await expect(
        uploadImageFile(deps, 'repo', 'draft', file),
      ).resolves.toEqual(expected);
    }
  });
});

describe('planImageRetry', () => {
  it('남은 blob 이 없으면 다시 시도하지 않고 횟수를 비움', () => {
    const plan = planImageRetry([], new Map([[BLOB_A, 2]]));
    expect(plan.retry).toBe(false);
    expect(plan.attempts.size).toBe(0);
  });

  it('남은 blob 마다 횟수를 하나씩 올리고 다시 시도', () => {
    const plan = planImageRetry([BLOB_A, BLOB_B], new Map([[BLOB_A, 1]]));
    expect(plan.retry).toBe(true);
    expect([...plan.attempts]).toEqual([
      [BLOB_A, 2],
      [BLOB_B, 1],
    ]);
  });

  it(`blob 한 장당 ${IMAGE_RETRY_MAX_ATTEMPTS}번까지만 (모두 다 쓰면 그만)`, () => {
    let attempts = new Map<string, number>();
    const results: boolean[] = [];

    for (let i = 0; i <= IMAGE_RETRY_MAX_ATTEMPTS; i += 1) {
      const plan = planImageRetry([BLOB_A], attempts);
      results.push(plan.retry);
      attempts = plan.attempts;
    }

    expect(results).toEqual([
      ...Array.from({ length: IMAGE_RETRY_MAX_ATTEMPTS }, () => true),
      false,
    ]);
    expect(attempts.get(BLOB_A)).toBe(IMAGE_RETRY_MAX_ATTEMPTS);
  });

  it('다 쓴 blob 이 있어도 새로 남은 blob 이 있으면 다시 시도', () => {
    const plan = planImageRetry(
      [BLOB_A, BLOB_B],
      new Map([[BLOB_A, IMAGE_RETRY_MAX_ATTEMPTS]]),
    );
    expect(plan.retry).toBe(true);
    expect(plan.attempts.get(BLOB_A)).toBe(IMAGE_RETRY_MAX_ATTEMPTS);
    expect(plan.attempts.get(BLOB_B)).toBe(1);
  });

  it('올라가서 사라진 blob 의 횟수는 지움 (입력 Map 은 바꾸지 않음)', () => {
    const before = new Map([
      [BLOB_A, 2],
      [BLOB_B, 1],
    ]);
    const plan = planImageRetry([BLOB_B], before);
    expect(plan.attempts.has(BLOB_A)).toBe(false);
    expect(before.get(BLOB_A)).toBe(2);
  });
});
