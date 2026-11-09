import { createBlockMarkdownSpec, Node } from '@tiptap/core';
import { countEmptyBlanks } from '@/lib/studio/draft-blank';

/**
 * 초안의 채워야 할 빈칸 블록 (Markdown: `:::blank {kind="…" hint="…"}`)
 * - 화면 동작은 편집기 쪽에서 덧붙이고, 여기서는 스키마와 Markdown 변환만 맡음
 */

const blankMarkdown = createBlockMarkdownSpec({
  nodeName: 'draftBlank',
  name: 'blank',
  allowedAttributes: ['kind', 'hint'],
});

export const DraftBlank = Node.create({
  name: 'draftBlank',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: 'detail',
        parseHTML: (el) => el.getAttribute('data-kind') ?? 'detail',
        renderHTML: (attrs) => ({ 'data-kind': attrs.kind }),
      },
      hint: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-hint') ?? '',
        renderHTML: (attrs) => ({ 'data-hint': attrs.hint }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-draft-blank]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-draft-blank': '' }, 0];
  },

  markdownTokenizer: blankMarkdown.markdownTokenizer,
  parseMarkdown: blankMarkdown.parseMarkdown,

  // 비어 있는 빈칸은 내보내지 않고, 채워진 빈칸은 본문만 남김
  renderMarkdown: (node, h) =>
    countEmptyBlanks({ type: 'doc', content: [node] }) > 0
      ? ''
      : h.renderChildren(node.content ?? [], '\n\n'),
});
