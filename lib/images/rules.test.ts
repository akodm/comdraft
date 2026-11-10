import { describe, expect, it } from 'vitest';
import {
  IMAGE_CLEANUP_GRACE_MS,
  checkImageFile,
  collectImageSrcs,
  findUnusedImages,
  getImagePath,
  getImagePublicUrl,
  getUploadPath,
  isUuid,
  parseImagePath,
  removeDisallowedImages,
} from '@/lib/images/rules';

const URL_BASE = 'https://ref.supabase.co';
const USER = 'user-1';
const ID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ok = `${URL_BASE}/storage/v1/object/public/comdraft-images/${USER}/${ID}.webp`;

describe('checkImageFile', () => {
  it('파일 검사', () => {
    expect(
      checkImageFile({
        type: 'image/png',
        name: 'a.png',
        size: 5 * 1024 * 1024,
      }),
    ).toEqual({ ok: true });
    expect(
      checkImageFile({
        type: 'image/png',
        name: 'a.png',
        size: 5 * 1024 * 1024 + 1,
      }),
    ).toEqual({ ok: false, reason: 'size' });
    expect(
      checkImageFile({ type: 'image/heic', name: 'a.heic', size: 10 }),
    ).toEqual({ ok: false, reason: 'heic' });
    expect(checkImageFile({ type: '', name: 'IMG_1.HEIC', size: 10 })).toEqual({
      ok: false,
      reason: 'heic',
    });
    expect(
      checkImageFile({ type: 'image/svg+xml', name: 'a.svg', size: 10 }),
    ).toEqual({ ok: false, reason: 'type' });
  });

  it('HEIC 는 크기가 커도 heic 가 우선이고 heif 도 거부', () => {
    expect(
      checkImageFile({
        type: 'image/heif',
        name: 'a.heif',
        size: 99 * 1024 * 1024,
      }),
    ).toEqual({ ok: false, reason: 'heic' });
  });

  it('허용 형식은 모두 통과', () => {
    for (const type of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ]) {
      expect(checkImageFile({ type, name: 'x', size: 1 })).toEqual({
        ok: true,
      });
    }
  });
});

describe('경로와 주소', () => {
  it('공개/임시 경로와 공개 주소', () => {
    expect(getImagePath(USER, ID)).toBe(`${USER}/${ID}.webp`);
    expect(getUploadPath(USER, ID)).toBe(`${USER}/${ID}`);
    expect(getImagePublicUrl(URL_BASE, `${USER}/${ID}.webp`)).toBe(ok);
  });

  it('허용 주소', () => {
    expect(parseImagePath(URL_BASE, ok, USER)).toBe(`${USER}/${ID}.webp`);
    expect(parseImagePath(URL_BASE, ok, 'user-2')).toBeNull();
    expect(
      parseImagePath(URL_BASE, 'https://evil.example/a.webp', USER),
    ).toBeNull();
    expect(
      parseImagePath(URL_BASE, 'blob:http://localhost/x', USER),
    ).toBeNull();
    expect(
      parseImagePath(URL_BASE, 'data:image/png;base64,AAA', USER),
    ).toBeNull();
    expect(parseImagePath(URL_BASE, `${ok}?x=1`, USER)).toBeNull();
    expect(
      parseImagePath(URL_BASE, ok.replace(ID, '../other'), USER),
    ).toBeNull();
  });

  it('조각, 다른 버킷, 비 UUID, 비 webp, 다른 호스트, 경로 이어붙이기 거부', () => {
    expect(parseImagePath(URL_BASE, `${ok}#frag`, USER)).toBeNull();
    expect(
      parseImagePath(
        URL_BASE,
        ok.replace('comdraft-images', 'comdraft-uploads'),
        USER,
      ),
    ).toBeNull();
    expect(
      parseImagePath(URL_BASE, ok.replace(ID, 'not-a-uuid'), USER),
    ).toBeNull();
    expect(
      parseImagePath(URL_BASE, ok.replace('.webp', '.png'), USER),
    ).toBeNull();
    expect(
      parseImagePath(
        URL_BASE,
        ok.replace('ref.supabase.co', 'ref.supabase.co.evil.io'),
        USER,
      ),
    ).toBeNull();
    expect(
      parseImagePath(
        URL_BASE,
        `${URL_BASE}/storage/v1/object/public/comdraft-images/${USER}/x/${ID}.webp`,
        USER,
      ),
    ).toBeNull();
    expect(
      parseImagePath(
        URL_BASE,
        `${URL_BASE}/storage/v1/object/public/comdraft-images/${USER}/%2e%2e/${ID}.webp`,
        USER,
      ),
    ).toBeNull();
    expect(parseImagePath(URL_BASE, ok.toUpperCase(), USER)).toBeNull();
    expect(parseImagePath(URL_BASE, '', USER)).toBeNull();
  });

  it('기준 주소 끝의 슬래시는 무시', () => {
    expect(parseImagePath(`${URL_BASE}/`, ok, USER)).toBe(`${USER}/${ID}.webp`);
    expect(getImagePublicUrl(`${URL_BASE}/`, `${USER}/${ID}.webp`)).toBe(ok);
  });
});

describe('removeDisallowedImages', () => {
  it('허용 안 되는 이미지 제거와 속성 정리', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: ok,
            alt: 'a',
            width: 640,
            height: 480,
            title: 'x',
            onerror: 'y',
          },
        },
        { type: 'image', attrs: { src: 'blob:http://localhost/x' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
      ],
    };
    const cleaned = removeDisallowedImages(doc, (src) => src === ok);
    expect(cleaned.content).toEqual([
      { type: 'image', attrs: { src: ok, alt: 'a', width: 640, height: 480 } },
      { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
    ]);
  });

  it('alt 는 200자로 자르고 문자열이 아니면 속성을 뺌, 크기는 양의 정수만', () => {
    const long = 'a'.repeat(250);
    const cleaned = removeDisallowedImages(
      {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: { src: ok, alt: long, width: 0, height: 1.5 },
          },
          {
            type: 'image',
            attrs: { src: ok, alt: 5, width: '640', height: -3 },
          },
          { type: 'image', attrs: { src: ok, width: 10, height: 20 } },
        ],
      },
      () => true,
    );
    expect(cleaned.content).toEqual([
      { type: 'image', attrs: { src: ok, alt: 'a'.repeat(200) } },
      { type: 'image', attrs: { src: ok } },
      { type: 'image', attrs: { src: ok, width: 10, height: 20 } },
    ]);
  });

  it('src 가 문자열이 아니거나 attrs 가 없는 이미지는 제거', () => {
    const cleaned = removeDisallowedImages(
      {
        type: 'doc',
        content: [{ type: 'image' }, { type: 'image', attrs: { src: 1 } }],
      },
      () => true,
    );
    expect(cleaned.content).toEqual([]);
  });

  it('중첩 노드(목록, 인용)도 처리하고 다른 노드는 그대로 둠', () => {
    const para = {
      type: 'paragraph',
      attrs: { textAlign: 'left' },
      content: [{ type: 'text', text: 'hi', marks: [{ type: 'bold' }] }],
    };
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [para, { type: 'image', attrs: { src: 'blob:x' } }],
            },
            {
              type: 'listItem',
              content: [{ type: 'image', attrs: { src: ok, title: 't' } }],
            },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'image', attrs: { src: 'data:x' } }],
        },
      ],
    };
    expect(removeDisallowedImages(doc, (src) => src === ok)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [para] },
            {
              type: 'listItem',
              content: [{ type: 'image', attrs: { src: ok } }],
            },
          ],
        },
        { type: 'blockquote', content: [] },
      ],
    });
  });

  it('입력을 변경하지 않음', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'blob:x', title: 't' } }],
    };
    const snapshot = JSON.stringify(doc);
    removeDisallowedImages(doc, () => false);
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});

describe('collectImageSrcs', () => {
  it('null 이면 빈 배열', () => {
    expect(collectImageSrcs(null)).toEqual([]);
  });

  it('중첩 노드의 image 도 모음', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: 'a' } },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'image', attrs: { src: 'b' } }],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
        { type: 'image', attrs: {} },
      ],
    };
    expect(collectImageSrcs(doc)).toEqual(['a', 'b']);
  });
});

describe('findUnusedImages', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const images = [
    { id: 'a', path: 'u/a.webp', createdAt: new Date('2026-11-10T11:00:00Z') },
    { id: 'b', path: 'u/b.webp', createdAt: new Date('2026-11-10T11:55:00Z') },
    { id: 'c', path: 'u/c.webp', createdAt: new Date('2026-11-10T11:00:00Z') },
  ];

  it('정리 대상: 안 쓰이고 유예가 지난 것만', () => {
    expect(findUnusedImages(images, new Set(['u/c.webp']), now)).toEqual([
      { id: 'a', path: 'u/a.webp' },
    ]);
    expect(
      findUnusedImages(images, new Set(['u/c.webp']), now, { grace: false }),
    ).toEqual([
      { id: 'a', path: 'u/a.webp' },
      { id: 'b', path: 'u/b.webp' },
    ]);
  });

  it('유예 경계: 정확히 10분이면 대상', () => {
    const edge = [
      {
        id: 'e',
        path: 'u/e.webp',
        createdAt: new Date(now.getTime() - IMAGE_CLEANUP_GRACE_MS),
      },
    ];
    expect(findUnusedImages(edge, new Set(), now)).toEqual([
      { id: 'e', path: 'u/e.webp' },
    ]);
    const young = [
      {
        id: 'y',
        path: 'u/y.webp',
        createdAt: new Date(now.getTime() - IMAGE_CLEANUP_GRACE_MS + 1),
      },
    ];
    expect(findUnusedImages(young, new Set(), now)).toEqual([]);
  });
});

describe('isUuid', () => {
  it('UUID 형식만 통과시킨다', () => {
    expect(isUuid('3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d')).toBe(true);
    expect(isUuid('../other-user/file')).toBe(false);
    expect(isUuid('3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d/x')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
