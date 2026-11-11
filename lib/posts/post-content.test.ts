import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  checkPublishable,
  InvalidPostContentError,
  extractPostExcerpt,
  removeLeadingTitle,
  sanitizePostContent,
} from '@/lib/posts/post-content';

const doc = (...content: JSONContent[]): JSONContent => ({
  type: 'doc',
  content,
});
const text = (value: string): JSONContent => ({ type: 'text', text: value });
const p = (value: string): JSONContent => ({
  type: 'paragraph',
  content: [text(value)],
});
const h = (level: number, value: string): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const link = (value: string, href: string): JSONContent => ({
  type: 'text',
  text: value,
  marks: [{ type: 'link', attrs: { href } }],
});
const blank = (): JSONContent => ({
  type: 'draftBlank',
  attrs: { kind: 'detail', hint: '' },
  content: [{ type: 'paragraph' }],
});
const SUPABASE_URL = 'https://ref.supabase.co';
const OWNER = 'user-1';
const OTHER = 'user-2';
const IMAGE_ID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OPTIONS = { imageOwnerId: OWNER, supabaseUrl: SUPABASE_URL };
const imageUrl = (userId: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/comdraft-images/${userId}/${IMAGE_ID}.webp`;
const image = (attrs: Record<string, unknown>): JSONContent => ({
  type: 'image',
  attrs,
});
// 기존 검사는 이미지가 없으므로 같은 옵션으로 정리
const sanitizeWithOptions = (input: JSONContent) =>
  sanitizePostContent(input, OPTIONS);
const codeBlock = (language: string, value: string): JSONContent => ({
  type: 'codeBlock',
  attrs: { language },
  content: [text(value)],
});

describe('checkPublishable', () => {
  it('빈칸이 남아 있으면 개수', () => {
    expect(checkPublishable(doc(h(1, '제목'), blank(), blank()))).toEqual({
      status: 'has_blanks',
      count: 2,
    });
  });

  it('채워진 빈칸도 남아 있으면 센다', () => {
    const filled: JSONContent = { ...blank(), content: [p('채움')] };

    expect(checkPublishable(doc(h(1, '제목'), filled))).toEqual({
      status: 'has_blanks',
      count: 1,
    });
  });

  it('빈칸 검사가 제목 검사보다 먼저', () => {
    expect(checkPublishable(doc(blank()))).toEqual({
      status: 'has_blanks',
      count: 1,
    });
  });

  it('제목이 없으면 no_title', () => {
    expect(checkPublishable(doc({ type: 'paragraph' }))).toEqual({
      status: 'no_title',
    });
  });

  it('통과하면 제목', () => {
    expect(checkPublishable(doc(h(1, '제목'), p('본문')))).toEqual({
      status: 'ok',
      title: '제목',
    });
  });
});

describe('checkPublishable 잘못된 구조', () => {
  it('던지지 않고 잘못된 항목을 무시한다', () => {
    const bad = {
      type: 'doc',
      content: [null, { type: 'paragraph', content: 'x' }, h(1, '제목')],
    } as unknown as JSONContent;

    expect(checkPublishable(bad)).toEqual({ status: 'ok', title: '제목' });
    expect(() => checkPublishable(null as never)).toThrow(
      InvalidPostContentError,
    );
  });
});

describe('sanitizePostContent', () => {
  it.each([' JavaScript:alert(1)', 'java\tscript:x', 'data:text/html,x'])(
    '위험한 링크 %j 는 마크가 지워진다',
    (href) => {
      const out = sanitizeWithOptions(
        doc({ type: 'paragraph', content: [link('a', href)] }),
      );

      expect(out.content?.[0].content?.[0]).toEqual({
        type: 'text',
        text: 'a',
      });
    },
  );

  it('알 수 없는 마크는 버린다', () => {
    const out = sanitizeWithOptions(
      doc({
        type: 'paragraph',
        content: [
          { ...text('a'), marks: [{ type: 'evil' }, { type: 'bold' }] },
        ],
      }),
    );

    expect(out.content?.[0].content?.[0].marks).toEqual([{ type: 'bold' }]);
  });

  it('링크의 rel·target·class 는 클라이언트 값을 버리고 편집기 설정을 쓴다', () => {
    const out = sanitizeWithOptions(
      doc({
        type: 'paragraph',
        content: [
          {
            ...text('a'),
            marks: [
              {
                type: 'link',
                attrs: {
                  href: 'https://a.com',
                  rel: '',
                  target: '_top',
                  class: 'fixed inset-0 z-50',
                },
              },
            ],
          },
        ],
      }),
    );

    expect(out.content?.[0].content?.[0].marks?.[0].attrs).toMatchObject({
      href: 'https://a.com',
      target: '_blank',
      rel: 'noopener noreferrer nofollow',
      class: null,
    });
  });

  it('codeBlock language 는 안전한 값만 허용', () => {
    const lang = (language: string) =>
      sanitizeWithOptions(doc(codeBlock(language, 'x'))).content?.[0].attrs
        ?.language;

    expect(lang('ts evil')).toBeNull();
    expect(lang('c++')).toBe('c++');
  });

  it('heading level 이 범위 밖이면 기본값', () => {
    const out = sanitizeWithOptions(doc(h(99, '제목')));

    expect(out.content?.[0].attrs?.level).toBe(1);
  });

  it('draftBlank 속성은 정리한다', () => {
    const out = sanitizeWithOptions(
      doc({
        ...blank(),
        attrs: { kind: 'oops', hint: 'a"b' },
        content: [p('x')],
      }),
    );

    expect(out.content?.[0].attrs).toMatchObject({
      kind: 'detail',
      hint: 'ab',
    });
  });

  it('잘못된 구조는 버리거나 InvalidPostContentError', () => {
    const out = sanitizeWithOptions(
      doc(
        null as unknown as JSONContent,
        {
          type: 'paragraph',
          content: [
            text('a'),
            null as unknown as JSONContent,
            { ...text('b'), marks: {} as never },
          ],
        },
        { type: 'paragraph', content: 'x' as never },
      ),
    );

    expect(out).toEqual(
      doc(
        // 같은 마크의 이웃한 글자는 ProseMirror 가 하나로 합침
        p('ab'),
        { type: 'paragraph' },
      ),
    );
    expect(() => sanitizeWithOptions(p('a'))).toThrow(InvalidPostContentError);
    expect(() => sanitizeWithOptions(null as never)).toThrow(
      InvalidPostContentError,
    );
  });

  it('javascript: 링크는 마크만 지우고 글자는 남긴다', () => {
    const out = sanitizeWithOptions(
      doc({
        type: 'paragraph',
        content: [link('클릭', 'javascript:alert(1)')],
      }),
    );

    expect(out.content?.[0].content?.[0]).toEqual({
      type: 'text',
      text: '클릭',
    });
  });

  it('파싱할 수 없는 href 도 마크를 지운다', () => {
    const out = sanitizeWithOptions(
      doc({ type: 'paragraph', content: [link('a', '/relative')] }),
    );

    expect(out.content?.[0].content?.[0].marks).toBeUndefined();
  });

  it('http, https, mailto 링크는 유지', () => {
    for (const href of ['http://a.com', 'https://a.com', 'mailto:a@a.com']) {
      const out = sanitizeWithOptions(
        doc({ type: 'paragraph', content: [link('a', href)] }),
      );

      expect(out.content?.[0].content?.[0].marks?.[0].attrs?.href).toBe(href);
    }
  });

  it('스키마에 없는 노드와 속성은 버린다', () => {
    const out = sanitizeWithOptions(
      doc(
        { type: 'iframe', attrs: { src: 'x' } },
        {
          type: 'paragraph',
          attrs: { onclick: 'x' },
          content: [text('a')],
        },
      ),
    );

    expect(out).toEqual(doc(p('a')));
  });

  it('정상 문서는 그대로', () => {
    const input = doc(h(2, '제목'), p('본문'), codeBlock('ts', 'const a = 1;'));

    expect(sanitizeWithOptions(input)).toEqual(input);
  });
});

describe('sanitizePostContent 이미지', () => {
  it('허용 이미지는 남기고 속성은 src/alt/width/height 만', () => {
    const out = sanitizePostContent(
      doc(
        {
          ...image({
            src: imageUrl(OWNER),
            alt: '그림',
            width: 640,
            height: 480,
            title: 't',
            onerror: 'alert(1)',
          }),
          content: [text('x')],
          marks: [{ type: 'bold' }],
        },
        p('본문'),
      ),
      OPTIONS,
    );

    expect(out).toEqual(
      doc(
        image({ src: imageUrl(OWNER), alt: '그림', width: 640, height: 480 }),
        p('본문'),
      ),
    );
  });

  it('다른 사용자 경로, 외부 주소, blob:, data: 이미지는 노드째 지운다', () => {
    const out = sanitizePostContent(
      doc(
        p('앞'),
        image({ src: imageUrl(OTHER) }),
        image({ src: 'https://evil.example/a.webp' }),
        image({ src: 'blob:http://localhost/x' }),
        image({ src: 'data:image/png;base64,AAA' }),
        image({ alt: 'src 없음' }),
        p('뒤'),
      ),
      OPTIONS,
    );

    expect(out).toEqual(doc(p('앞'), p('뒤')));
  });

  it('alt 는 200자로 자른다', () => {
    const out = sanitizePostContent(
      doc(image({ src: imageUrl(OWNER), alt: '가'.repeat(250) })),
      OPTIONS,
    );

    expect(out.content?.[0].attrs?.alt).toBe('가'.repeat(200));
  });

  it('width/height 는 양의 정수만, alt 는 문자열만 (아니면 비움)', () => {
    const out = sanitizePostContent(
      doc(
        image({ src: imageUrl(OWNER), alt: 5, width: -3, height: '480' }),
        image({ src: imageUrl(OWNER), width: 1.5, height: 0 }),
      ),
      OPTIONS,
    );

    expect(out.content?.map((node) => node.attrs)).toEqual([
      { src: imageUrl(OWNER), alt: null, width: null, height: null },
      { src: imageUrl(OWNER), alt: null, width: null, height: null },
    ]);
  });

  it('이미지를 빼서 비게 된 인용·목록 항목이 있어도 게시할 수 있다', () => {
    const out = sanitizePostContent(
      doc(
        p('본문'),
        { type: 'blockquote', content: [image({ src: 'blob:x' })] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [p('항목'), image({ src: imageUrl(OTHER) })],
            },
          ],
        },
      ),
      OPTIONS,
    );

    expect(out).toEqual(
      doc(p('본문'), {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p('항목')] }],
      }),
    );
  });

  it('소유자나 기준 주소가 비었으면 이미지를 모두 지운다', () => {
    const input = doc(p('a'), image({ src: imageUrl(OWNER) }));

    expect(
      sanitizePostContent(input, { ...OPTIONS, imageOwnerId: '' }),
    ).toEqual(doc(p('a')));
    expect(sanitizePostContent(input, { ...OPTIONS, supabaseUrl: '' })).toEqual(
      doc(p('a')),
    );
  });
});

describe('extractPostExcerpt', () => {
  it('이미지는 건너뛴다', () => {
    expect(
      extractPostExcerpt(
        doc(
          p('앞'),
          image({ src: imageUrl(OWNER), alt: '그림 설명' }),
          p('뒤'),
        ),
      ),
    ).toBe('앞 뒤');
  });

  it('요약은 문단 글자만, 코드·제목 건너뜀', () => {
    expect(
      extractPostExcerpt(
        doc(h(1, '제목'), codeBlock('ts', 'x'), p('첫 문단'), p('둘째')),
      ),
    ).toBe('첫 문단 둘째');
  });

  it('줄바꿈은 공백으로 잇는다', () => {
    expect(
      extractPostExcerpt(
        doc({
          type: 'paragraph',
          content: [text('가'), { type: 'hardBreak' }, text('나')],
        }),
      ),
    ).toBe('가 나');
  });

  it('요약 160자 자르기', () => {
    expect(extractPostExcerpt(doc(p('가'.repeat(200))))).toHaveLength(160);
  });

  it('문단이 없으면 빈 값', () => {
    expect(extractPostExcerpt(doc(h(1, '제목')))).toBe('');
  });
});

describe('removeLeadingTitle', () => {
  it('본문 첫 제목이 게시글 제목과 같으면 뺀다', () => {
    expect(removeLeadingTitle(doc(h(1, '제목'), p('본문')), '제목')).toEqual(
      doc(p('본문')),
    );
  });

  it('앞의 빈 문단은 건너뛰고 첫 제목을 뺀다', () => {
    const empty: JSONContent = { type: 'paragraph' };
    expect(
      removeLeadingTitle(doc(empty, h(2, '  제목  '), p('본문')), '제목'),
    ).toEqual(doc(empty, p('본문')));
  });

  it('첫 내용이 문단이면 그대로 둔다', () => {
    const input = doc(p('제목'), h(1, '제목'));
    expect(removeLeadingTitle(input, '제목')).toEqual(input);
  });

  it('첫 제목이 게시글 제목과 다르면 그대로 둔다', () => {
    const input = doc(h(1, '다른 제목'), p('본문'));
    expect(removeLeadingTitle(input, '제목')).toEqual(input);
  });
});
