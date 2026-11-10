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
          <span className="font-mono text-[10px] leading-[normal] text-ink-faint">
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
 * 게시글 본문 (서버에서 Tiptap 문서를 편집기와 같은 스키마로 그림)
 * - 편집기와 같은 prose 클래스를 써서 모양을 맞춤
 */
const PostContent = ({ content }: PostContentProps) => {
  return (
    <div className={PROSE_CLASS}>
      {renderToReactElement({
        content,
        extensions: createDraftSchemaExtensions(),
        options: { nodeMapping: { codeBlock: renderCodeBlock } },
      })}
    </div>
  );
};

export default PostContent;
