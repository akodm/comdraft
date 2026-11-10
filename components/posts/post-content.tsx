import type { JSONContent } from '@tiptap/core';
import { renderToReactElement } from '@tiptap/static-renderer/pm/react';
import { PROSE_CLASS } from '@/components/shared/prose';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

interface PostContentProps {
  // 게시할 때 정리를 거친 Tiptap 문서
  content: JSONContent;
}

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
      })}
    </div>
  );
};

export default PostContent;
