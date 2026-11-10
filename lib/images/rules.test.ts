import { getSchema, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  IMAGE_CLEANUP_GRACE_MS,
  checkImageFile,
  collectImageSrcs,
  collectOwnImagePaths,
  excludeReferencedImages,
  findCleanupCandidates,
  findUnusedImages,
  getImagePath,
  getImagePublicUrl,
  getUploadPath,
  isUuid,
  parseImagePath,
  removeDisallowedImages,
} from '@/lib/images/rules';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

const URL_BASE = 'https://ref.supabase.co';
const USER = 'user-1';
const ID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ok = `${URL_BASE}/storage/v1/object/public/comdraft-images/${USER}/${ID}.webp`;
const schema = getSchema(createDraftSchemaExtensions());

// 정리 결과가 문서 스키마에 맞는지 (맞지 않으면 던짐)
const checkSchema = (doc: JSONContent) => schema.nodeFromJSON(doc).check();

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

  it('기준 주소나 사용자 id 가 비었거나 사용자 id 에 / 가 있으면 거부', () => {
    const rootPrefix = '/storage/v1/object/public/comdraft-images/';
    expect(parseImagePath('', `${rootPrefix}${USER}/${ID}.webp`, USER)).toBe(
      null,
    );
    expect(parseImagePath('/', `${rootPrefix}${USER}/${ID}.webp`, USER)).toBe(
      null,
    );
    expect(
      parseImagePath(URL_BASE, `${URL_BASE}${rootPrefix}/${ID}.webp`, ''),
    ).toBeNull();
    expect(
      parseImagePath(
        URL_BASE,
        `${URL_BASE}${rootPrefix}${USER}/x/${ID}.webp`,
        `${USER}/x`,
      ),
    ).toBeNull();
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
        content: [
          { type: 'image' },
          { type: 'image', attrs: { src: 1 } },
          { type: 'paragraph' },
        ],
      },
      () => true,
    );
    expect(cleaned.content).toEqual([{ type: 'paragraph' }]);
  });

  it('남기는 이미지는 type 과 attrs 만 (content, marks, text 등은 버림)', () => {
    const cleaned = removeDisallowedImages(
      {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: { src: ok },
            content: [{ type: 'text', text: 'x' }],
            marks: [{ type: 'bold' }],
            text: 'y',
          } as JSONContent,
        ],
      },
      () => true,
    );
    expect(cleaned.content).toEqual([{ type: 'image', attrs: { src: ok } }]);
  });

  it('이미지를 빼서 비게 된 목록 항목·목록·인용은 지우고 문서는 스키마에 맞음', () => {
    const para = { type: 'paragraph', content: [{ type: 'text', text: 'a' }] };
    const cleaned = removeDisallowedImages(
      {
        type: 'doc',
        content: [
          para,
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'image', attrs: { src: 'blob:x' } }],
              },
            ],
          },
          {
            type: 'orderedList',
            content: [
              { type: 'listItem', content: [para] },
              {
                type: 'listItem',
                content: [{ type: 'image', attrs: { src: 'blob:y' } }],
              },
            ],
          },
          {
            type: 'blockquote',
            content: [
              {
                type: 'blockquote',
                content: [{ type: 'image', attrs: { src: 'data:x' } }],
              },
            ],
          },
        ],
      },
      () => false,
    );
    expect(cleaned).toEqual({
      type: 'doc',
      content: [
        para,
        {
          type: 'orderedList',
          content: [{ type: 'listItem', content: [para] }],
        },
      ],
    });
    expect(() => checkSchema(cleaned)).not.toThrow();
  });

  it('글자 블록(문단, 제목)은 비어도 남겨 목록 항목 첫 문단 자리를 지킴', () => {
    const nested = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
    };
    const cleaned = removeDisallowedImages(
      {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'image', attrs: { src: 'blob:x' } }],
                  },
                  nested,
                ],
              },
            ],
          },
        ],
      },
      () => false,
    );
    expect(cleaned.content).toEqual([
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph' }, nested] },
        ],
      },
    ]);
    expect(() => checkSchema(cleaned)).not.toThrow();
  });

  it('모두 지워져 빈 문서가 되면 빈 문단 하나를 남김 (원래 빈 문서는 그대로)', () => {
    const cleaned = removeDisallowedImages(
      {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [{ type: 'image', attrs: { src: 'blob:x' } }],
          },
        ],
      },
      () => false,
    );
    expect(cleaned).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(() => checkSchema(cleaned)).not.toThrow();
    expect(
      removeDisallowedImages({ type: 'doc', content: [] }, () => false),
    ).toEqual({ type: 'doc', content: [] });
  });

  it('객체가 아닌 자식은 건드리지 않음', () => {
    const doc = { type: 'doc', content: [null, 'x'] } as unknown as JSONContent;
    expect(removeDisallowedImages(doc, () => false)).toEqual(doc);
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

  it('저장된 본문의 잘못된 자식(객체 아님, content 가 배열 아님)은 건너뜀', () => {
    const doc = {
      type: 'doc',
      content: [
        null,
        'x',
        { type: 'paragraph', content: 'y' },
        { type: 'image', attrs: { src: 'a' } },
      ],
    } as unknown as JSONContent;
    expect(collectImageSrcs(doc)).toEqual(['a']);
  });
});

describe('collectOwnImagePaths', () => {
  const ID_2 = '7c9d0e1f-2a3b-4c5d-8e6f-1a2b3c4d5e6f';
  const src = (user: string, id: string) =>
    `${URL_BASE}/storage/v1/object/public/comdraft-images/${user}/${id}.webp`;
  const body = (...srcs: string[]) => ({
    type: 'doc',
    content: srcs.map((s) => ({ type: 'image', attrs: { src: s } })),
  });

  it('바뀌기 전 본문과 새 본문의 그 사용자 경로를 합침 (빠지는 이미지도 마지막 사용 시각을 갱신)', () => {
    const before = body(src(USER, ID), src(USER, ID_2));
    const after = body(src(USER, ID_2));
    expect([...collectOwnImagePaths([before, after], URL_BASE, USER)]).toEqual([
      `${USER}/${ID}.webp`,
      `${USER}/${ID_2}.webp`,
    ]);
  });

  it('다른 사용자 경로, 외부 주소, blob, 빈 본문은 넣지 않음', () => {
    const doc = body(
      src('user-2', ID),
      'https://evil.example/x.webp',
      'blob:http://localhost:3003/a',
    );
    expect(
      collectOwnImagePaths([doc, null, undefined], URL_BASE, USER).size,
    ).toBe(0);
  });
});

describe('findUnusedImages', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const images = [
    { id: 'a', path: 'u/a.webp', lastUsedAt: new Date('2026-11-10T11:00:00Z') },
    { id: 'b', path: 'u/b.webp', lastUsedAt: new Date('2026-11-10T11:55:00Z') },
    { id: 'c', path: 'u/c.webp', lastUsedAt: new Date('2026-11-10T11:00:00Z') },
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
        lastUsedAt: new Date(now.getTime() - IMAGE_CLEANUP_GRACE_MS),
      },
    ];
    expect(findUnusedImages(edge, new Set(), now)).toEqual([
      { id: 'e', path: 'u/e.webp' },
    ]);
    const young = [
      {
        id: 'y',
        path: 'u/y.webp',
        lastUsedAt: new Date(now.getTime() - IMAGE_CLEANUP_GRACE_MS + 1),
      },
    ];
    expect(findUnusedImages(young, new Set(), now)).toEqual([]);
  });

  it('오래전에 올렸어도 1분 전에 저장한 본문에 있던 이미지는 남김 (잘라 붙이기·실행 취소)', () => {
    const rows = [
      {
        id: 'm',
        path: 'u/m.webp',
        createdAt: new Date('2026-11-01T00:00:00Z'),
        lastUsedAt: new Date(now.getTime() - 60 * 1000),
      },
    ];
    expect(findUnusedImages(rows, new Set(), now)).toEqual([]);
  });
});

describe('findCleanupCandidates', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const old = new Date(now.getTime() - IMAGE_CLEANUP_GRACE_MS - 1);
  const fresh = new Date(now.getTime() - 1000);
  const row = (id: string, lastUsedAt: Date) => ({
    id,
    path: `${USER}/${id}.webp`,
    lastUsedAt,
  });

  it('초안이 지워진 그 사용자의 행도 후보에 넣고, 본문에서 쓰는 것은 뺌', () => {
    const used = new Set([`${USER}/used.webp`]);
    expect(
      findCleanupCandidates(
        [row('own-old', old), row('used', old)],
        [row('orphan-old', old), row('used', old)],
        used,
        now,
      ),
    ).toEqual([
      { id: 'own-old', path: `${USER}/own-old.webp` },
      { id: 'orphan-old', path: `${USER}/orphan-old.webp` },
    ]);
  });

  it('주인 없는 행은 grace: false 여도 항상 10분 유예', () => {
    expect(
      findCleanupCandidates(
        [row('own-fresh', fresh)],
        [row('orphan-fresh', fresh), row('orphan-old', old)],
        new Set(),
        now,
        { grace: false },
      ),
    ).toEqual([
      { id: 'own-fresh', path: `${USER}/own-fresh.webp` },
      { id: 'orphan-old', path: `${USER}/orphan-old.webp` },
    ]);
  });

  it('기본은 그 초안의 행에도 유예', () => {
    expect(
      findCleanupCandidates([row('own-fresh', fresh)], [], new Set(), now),
    ).toEqual([]);
  });
});

describe('excludeReferencedImages', () => {
  it('다른 초안·게시글이 쓰는 경로는 지우지 않음 (같은 사용자의 초안 사이 복사)', () => {
    const images = [
      { id: 'a', path: `${USER}/a.webp` },
      { id: 'b', path: `${USER}/b.webp` },
    ];
    expect(
      excludeReferencedImages(images, new Set([`${USER}/b.webp`])),
    ).toEqual([{ id: 'a', path: `${USER}/a.webp` }]);
    expect(excludeReferencedImages(images, new Set())).toEqual(images);
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
