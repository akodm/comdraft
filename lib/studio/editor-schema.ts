import type { AnyExtension } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Image } from '@tiptap/extension-image';
import { StarterKit } from '@tiptap/starter-kit';
import { DraftBlank } from '@/lib/studio/draft-blank-node';

/**
 * 초안 문서 스키마를 정하는 확장 (편집기와 서버의 Markdown → 문서 변환이 같은 노드/마크를 쓰도록 공유)
 * - 화면 전용 동작(코드 블록 노드 뷰, 빈 줄 안내 문구)은 components/studio/editor-extensions.ts 에서 덧붙임
 */

// 편집기에서 쓸 수 있는 제목 단계 (목차처럼 깊은 제목도 쓰도록 H1~H6 모두)
export const DRAFT_HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export type DraftHeadingLevel = (typeof DRAFT_HEADING_LEVELS)[number];

// Markdown 이미지 대체 글에서 문법을 깨는 \, [, ] 를 이스케이프
const escapeMarkdownAlt = (alt: string) => alt.replace(/[\\[\]]/g, '\\$&');

/**
 * 본문 이미지 (블록, base64 금지)
 * - 속성은 src/alt/width/height 만 (기본 확장의 title 은 뺌)
 * - 주소 허용 검사는 저장·게시·AI 반영 때 서버에서 (lib/images/rules.ts)
 * - MD 내보내기는 `![대체 글](주소)` (대체 글은 이스케이프, 주소는 공개 버킷 주소라 그대로)
 */
export const DraftImage = Image.extend({
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },
  renderMarkdown: (node) => {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';

    return `![${escapeMarkdownAlt(alt)}](${src})`;
  },
}).configure({ inline: false, allowBase64: false });

export const createDraftSchemaExtensions = (
  codeBlock: AnyExtension = CodeBlock,
  draftBlank: AnyExtension = DraftBlank,
): AnyExtension[] => [
  StarterKit.configure({
    codeBlock: false,
    heading: { levels: [...DRAFT_HEADING_LEVELS] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    },
  }),
  codeBlock,
  draftBlank,
  DraftImage,
];
