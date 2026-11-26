import { Extension } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { renderToReactElement } from '@tiptap/static-renderer/pm/react';
import type { ReactNode } from 'react';
import { PROSE_CLASS } from '@/components/shared/prose';
import { getLanguageName } from '@/components/studio/code-block-node-view';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

interface PostContentProps {
  // 게시할 때 정리를 거친 Tiptap 문서
  content: JSONContent;
}

/**
 * 코드 블록: 편집기처럼 색 강조 없이 상단에 언어 이름만 표시 (언어가 없으면 이름 없음)
 */
const renderCodeBlock = ({
  node,
  children,
}: {
  node: { attrs?: Record<string, unknown> };
  children?: ReactNode;
}) => {
  const language = node.attrs?.language;

  return (
    <div className="not-prose flex flex-col gap-3 rounded bg-surface p-3.5 pc:p-5">
      {typeof language === 'string' && language && (
        <div className="flex items-center justify-between gap-3 select-none">
          <span className="font-mono text-[11px] leading-[normal] text-ink-faint">
            {getLanguageName(language)}
          </span>
        </div>
      )}
      <pre className="overflow-x-auto font-mono text-[11px] leading-[1.8] text-ink pc:text-[13px]">
        <code>{children}</code>
      </pre>
    </div>
  );
};

/**
 * 제목 앵커: 본문에 붙여 둔 attrs.id 를 제목 요소의 id 로 그림 (목차에서 이동할 위치)
 * - id 는 buildPostOutline 이 붙임 (게시 본문에는 저장하지 않음)
 */
const HeadingAnchor = Extension.create({
  name: 'headingAnchor',
  addGlobalAttributes: () => [
    {
      types: ['heading'],
      attributes: {
        id: {
          default: null,
          renderHTML: (attributes) =>
            typeof attributes.id === 'string' && attributes.id
              ? { id: attributes.id }
              : {},
        },
      },
    },
  ],
});

const toPositiveInteger = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;

/**
 * 이미지: 본문 폭을 넘지 않게 줄이고 화면에 가까워질 때 불러옴
 * - 주소는 게시할 때 정리한 공개 버킷 주소만 남아 있음 (sanitizePostContent)
 * - 원본 크기(width/height)로 자리를 먼저 잡아 불러오는 동안 글이 밀리지 않게 함
 */
const renderImage = ({
  node,
}: {
  node: { attrs?: Record<string, unknown> };
}) => {
  const { src, alt, width, height } = node.attrs ?? {};

  if (typeof src !== 'string' || !src) {
    return null;
  }

  return (
    // 게시 때 정리한 공개 저장소의 WebP 주소를 그대로 씀 (이미 변환·축소한 파일)
    <img
      src={src}
      alt={typeof alt === 'string' ? alt : ''}
      width={toPositiveInteger(width)}
      height={toPositiveInteger(height)}
      loading="lazy"
      decoding="async"
      className="h-auto max-w-full"
    />
  );
};

/**
 * 게시글 본문 (서버에서 Tiptap 문서를 편집기와 같은 스키마로 그림)
 * - 편집기와 같은 prose 클래스를 써서 모양을 맞춤
 * - 편집기(ProseMirror 기본 스타일)처럼 긴 URL·인라인 코드도 줄을 바꿔 모바일에서 화면 밖으로 밀리지 않게 함
 * - 제목에 attrs.id 가 있으면 id 로 그리고, 앵커로 이동할 때 화면 맨 위에 붙지 않게 여백을 둠
 */
const PostContent = ({ content }: PostContentProps) => {
  return (
    <div
      className={`${PROSE_CLASS} wrap-break-word [&_:is(h1,h2,h3,h4,h5,h6)]:scroll-mt-8`}
    >
      {renderToReactElement({
        content,
        extensions: [...createDraftSchemaExtensions(), HeadingAnchor],
        options: {
          nodeMapping: { codeBlock: renderCodeBlock, image: renderImage },
        },
      })}
    </div>
  );
};

export default PostContent;
