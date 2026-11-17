'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { Extension } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { serializePromptDocument } from '@/lib/studio/prompt-markdown';

export interface PromptEditorHandle {
  clear: () => void;
}

interface PromptEditorProps {
  ref?: Ref<PromptEditorHandle>;
  label: string;
  placeholder: string;
  // 내용이 바뀔 때마다 Markdown 글로 알림
  onChange: (markdown: string) => void;
  // ⌘/Ctrl + Enter
  onSubmit: () => void;
}

// 작성 요청 입력 서식 (StarterKit 에서 목록, 코드 블록, 인용, 굵게, 기울임, 인라인 코드만 남김)
// - 붙여넣은 제목·링크·표 등은 스키마에 없어 글자만 남음
const PROMPT_STARTER_KIT = StarterKit.configure({
  heading: false,
  link: false,
  horizontalRule: false,
  strike: false,
  underline: false,
  trailingNode: false,
});

const EDITOR_CLASS = [
  'min-h-[3.6em] text-[12px] leading-[1.8] break-words text-ink outline-none pc:text-[14px]',
  '[&>*+*]:mt-1.5',
  // 목록
  '[&_ul]:list-disc [&_ol]:list-decimal [&_:is(ul,ol)]:pl-5 [&_li]:my-0.5 [&_li]:marker:text-ink-faint',
  // 인용
  '[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted',
  // 인라인 코드, 코드 블록
  '[&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.92em]',
  '[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-surface [&_pre]:px-3 [&_pre]:py-2 [&_pre]:leading-[1.6] [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  // 빈 입력창 안내 문구 (Placeholder 확장)
  '[&_.is-editor-empty]:before:pointer-events-none [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:h-0 [&_.is-editor-empty]:before:text-ink-subtle [&_.is-editor-empty]:before:content-[attr(data-placeholder)]',
].join(' ');

/**
 * 작성 요청 입력창 (서식 일부만 쓰는 작은 편집기)
 * - `- `, `1. `, `> `, ``` 로 목록·인용·코드 블록, **굵게**, *기울임*, `코드` 를 입력하면서 바로 보여 줌
 * - 바뀔 때마다 작성 요청 전용 Markdown 으로 바꿔 알림 (lib/studio/prompt-markdown.ts)
 * - ⌘/Ctrl + Enter 로 제출 (한글 조합 중에는 ProseMirror 가 단축키를 처리하지 않음)
 */
const PromptEditor = ({
  ref,
  label,
  placeholder,
  onChange,
  onSubmit,
}: PromptEditorProps) => {
  // 편집기는 한 번만 만들고, 바뀌는 콜백은 ref 로 최신 값을 씀
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSubmitRef.current = onSubmit;
  });

  const editor = useEditor({
    extensions: [
      PROMPT_STARTER_KIT,
      Placeholder.configure({ placeholder }),
      Extension.create({
        name: 'promptSubmit',
        addKeyboardShortcuts: () => ({
          'Mod-Enter': () => {
            onSubmitRef.current();
            return true;
          },
        }),
      }),
    ],
    // 서버 렌더링 결과와 맞추기 위해 클라이언트에서 마운트한 뒤 생성
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: EDITOR_CLASS,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
      },
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(serializePromptDocument(current.getJSON()));
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        editor?.commands.clearContent(true);
      },
    }),
    [editor],
  );

  return (
    <EditorContent
      editor={editor}
      className="max-h-48 w-full cursor-text overflow-y-auto"
    />
  );
};

export default PromptEditor;
