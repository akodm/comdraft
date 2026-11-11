'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  DROPDOWN_ITEM_BASE_CLASS,
  DROPDOWN_ITEM_CLASS,
  DROPDOWN_PANEL_CLASS,
} from '@/components/shared/dropdown-styles';
import { ICON_BUTTON_CLASS } from '@/components/studio/studio-styles';
import { useDropdown } from '@/hooks/use-dropdown';
import { IMAGE_ACCEPTED_MIME_TYPES } from '@/lib/images/rules';
import type { DraftHeadingLevel } from '@/lib/studio/editor-schema';

// 파일 선택 창에서 고를 수 있는 형식 (HEIC 도 고를 수 있게 해 지원하지 않는다고 안내)
const IMAGE_INPUT_ACCEPT = [
  ...IMAGE_ACCEPTED_MIME_TYPES,
  '.heic',
  '.heif',
].join(',');

// 제목 단계는 편집기 스키마(DRAFT_HEADING_LEVELS)와 맞춤
const HEADING_LEVELS = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
} as const satisfies Record<string, DraftHeadingLevel>;

type BlockStyle = 'paragraph' | keyof typeof HEADING_LEVELS;

const BLOCK_STYLES: Array<{ value: BlockStyle; label: MessageDescriptor }> = [
  { value: 'paragraph', label: msg`본문` },
  { value: 'h1', label: msg`제목 1` },
  { value: 'h2', label: msg`제목 2` },
  { value: 'h3', label: msg`제목 3` },
  { value: 'h4', label: msg`제목 4` },
  { value: 'h5', label: msg`제목 5` },
  { value: 'h6', label: msg`제목 6` },
];

type ToolKey =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'bulletList'
  | 'orderedList'
  | 'codeBlock'
  | 'blockquote'
  | 'undo'
  | 'redo';

interface Tool {
  key: ToolKey;
  icon: string;
  label: MessageDescriptor;
  // 모바일 툴바에는 디자인대로 일부 도구만 표시
  isPcOnly?: boolean;
}

// 링크 버튼은 입력 팝오버가 필요해 따로 렌더링 (orderedList 와 codeBlock 사이)
const FORMAT_TOOLS: Tool[] = [
  { key: 'bold', icon: 'bold', label: msg`굵게` },
  { key: 'italic', icon: 'italic', label: msg`기울임` },
  { key: 'strike', icon: 'strikethrough', label: msg`취소선`, isPcOnly: true },
  { key: 'bulletList', icon: 'list', label: msg`글머리 기호 목록` },
  {
    key: 'orderedList',
    icon: 'list-ordered',
    label: msg`번호 목록`,
    isPcOnly: true,
  },
];

const BLOCK_TOOLS: Tool[] = [
  { key: 'codeBlock', icon: 'code-xml', label: msg`코드 블록` },
  { key: 'blockquote', icon: 'quote', label: msg`인용`, isPcOnly: true },
  { key: 'undo', icon: 'undo-2', label: msg`실행 취소` },
  { key: 'redo', icon: 'redo-2', label: msg`다시 실행`, isPcOnly: true },
];

const runTool = (editor: Editor, key: ToolKey) => {
  const chain = editor.chain().focus();

  switch (key) {
    case 'bold':
      return chain.toggleBold().run();
    case 'italic':
      return chain.toggleItalic().run();
    case 'strike':
      return chain.toggleStrike().run();
    case 'bulletList':
      return chain.toggleBulletList().run();
    case 'orderedList':
      return chain.toggleOrderedList().run();
    case 'codeBlock':
      return chain.toggleCodeBlock().run();
    case 'blockquote':
      return chain.toggleBlockquote().run();
    case 'undo':
      return chain.undo().run();
    case 'redo':
      return chain.redo().run();
  }
};

const getBlockStyle = (editor: Editor): BlockStyle => {
  for (const [style, level] of Object.entries(HEADING_LEVELS)) {
    if (editor.isActive('heading', { level })) {
      return style as BlockStyle;
    }
  }

  return 'paragraph';
};

const TOOL_BUTTON_CLASS = `size-7.5 pc:size-8 ${ICON_BUTTON_CLASS}`;
const ACTIVE_TOOL_BUTTON_CLASS = `${TOOL_BUTTON_CLASS} bg-surface`;

interface ToolbarProps {
  editor: Editor | null;
  // 초안이 없으면(새 초안 화면) 모든 도구 비활성
  isDisabled: boolean;
  // 이미지 넣기 버튼으로 고른 파일
  onInsertImages: (files: File[]) => void;
}

// 문단 스타일 선택 (본문 / 제목 1~6)
const BlockStyleMenu = ({
  editor,
  current,
  isDisabled,
}: {
  editor: Editor | null;
  current: BlockStyle;
  isDisabled: boolean;
}) => {
  const { t, i18n } = useLingui();
  const menuId = useId();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLButtonElement>();
  const currentLabel =
    BLOCK_STYLES.find(({ value }) => value === current)?.label ??
    BLOCK_STYLES[0].label;

  const apply = (style: BlockStyle) => {
    if (!editor) {
      return;
    }

    const chain = editor.chain().focus();

    if (style === 'paragraph') {
      chain.setParagraph().run();
    } else {
      chain.setHeading({ level: HEADING_LEVELS[style] }).run();
    }

    toggle();
  };

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t`문단 스타일`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        disabled={isDisabled}
        onClick={toggle}
        className="flex h-8 items-center gap-2 rounded px-2 text-[12px] leading-[normal] whitespace-nowrap text-ink-muted hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {i18n._(currentLabel)}
        <Image
          src="/images/studio/chevron-down.svg"
          alt=""
          width={12}
          height={12}
        />
      </button>
      {isOpen && (
        <div
          id={menuId}
          className={`absolute top-[calc(100%+4px)] left-0 w-36 ${DROPDOWN_PANEL_CLASS}`}
        >
          <ul className="flex flex-col gap-1">
            {BLOCK_STYLES.map(({ value, label }, index) => (
              <li key={value}>
                <button
                  ref={index === 0 ? firstItemRef : undefined}
                  type="button"
                  aria-current={value === current ? 'true' : undefined}
                  onClick={() => apply(value)}
                  className={
                    value === current
                      ? `${DROPDOWN_ITEM_BASE_CLASS} font-medium text-ink`
                      : DROPDOWN_ITEM_CLASS
                  }
                >
                  {i18n._(label)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// 링크 추가/수정/제거 팝오버
const LinkMenu = ({
  editor,
  isActive,
  isDisabled,
}: {
  editor: Editor | null;
  isActive: boolean;
  isDisabled: boolean;
}) => {
  const { t } = useLingui();
  const menuId = useId();
  const [url, setUrl] = useState('');
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLInputElement>();

  const open = () => {
    if (!isOpen) {
      setUrl(editor?.getAttributes('link').href ?? '');
    }

    toggle();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editor) {
      return;
    }

    const href = url.trim();
    const chain = editor.chain().focus().extendMarkRange('link');

    if (!href) {
      chain.unsetLink().run();
    } else if (editor.state.selection.empty && !isActive) {
      // 선택한 글자가 없으면 주소를 링크 글자로 넣음
      chain
        .insertContent({
          type: 'text',
          text: href,
          marks: [{ type: 'link', attrs: { href } }],
        })
        .run();
    } else {
      chain.setLink({ href }).run();
    }

    toggle();
  };

  const remove = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    toggle();
  };

  // 모바일은 링크 버튼 기준 가운데 정렬이면 좁은 화면(320px)에서 오른쪽으로 넘쳐,
  // 도구 모음(relative) 기준으로 도구 모음 폭에 맞춰 펼침
  return (
    <div ref={containerRef} className="pc:relative" onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t`링크`}
        aria-pressed={isActive}
        aria-expanded={isOpen}
        aria-controls={menuId}
        disabled={isDisabled}
        onClick={open}
        className={isActive ? ACTIVE_TOOL_BUTTON_CLASS : TOOL_BUTTON_CLASS}
      >
        <Image src="/images/studio/link.svg" alt="" width={17} height={17} />
      </button>
      {isOpen && (
        <form
          id={menuId}
          onSubmit={submit}
          className={`absolute inset-x-0 top-[calc(100%+4px)] pc:inset-x-auto pc:left-1/2 pc:w-72 pc:-translate-x-1/2 ${DROPDOWN_PANEL_CLASS}`}
        >
          <label className="flex flex-col gap-2 text-[12px] leading-[normal] font-medium text-ink">
            <Trans>링크 주소</Trans>
            <input
              ref={firstItemRef}
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
              className="h-9 rounded border border-line px-3 font-mono text-[12px] font-normal outline-none focus:border-ink-faint"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            {isActive && (
              <button
                type="button"
                onClick={remove}
                className="h-8 rounded px-3 text-[12px] text-danger hover:bg-surface"
              >
                <Trans>링크 제거</Trans>
              </button>
            )}
            <button
              type="submit"
              className="h-8 rounded bg-ink px-3 text-[12px] font-medium text-white"
            >
              <Trans>적용</Trans>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// 이미지 넣기: 숨긴 파일 선택 창을 엶 (여러 장 선택 가능)
const ImageInsertButton = ({
  isDisabled,
  onFiles,
}: {
  isDisabled: boolean;
  onFiles: (files: File[]) => void;
}) => {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        aria-label={t`이미지 넣기`}
        disabled={isDisabled}
        onClick={() => inputRef.current?.click()}
        className={TOOL_BUTTON_CLASS}
      >
        <Image
          src="/images/studio/image-plus.svg"
          alt=""
          width={17}
          height={17}
        />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_INPUT_ACCEPT}
        multiple
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);

          // 같은 파일을 다시 골라도 change 가 오도록 비움
          event.target.value = '';

          if (files.length > 0) {
            onFiles(files);
          }
        }}
      />
    </>
  );
};

/**
 * 편집 서식 툴바 (PC: 전체 도구, 모바일: 디자인대로 굵게/기울임/목록/링크/이미지/코드/실행 취소만)
 */
const EditorToolbar = ({
  editor,
  isDisabled,
  onInsertImages,
}: ToolbarProps) => {
  const { t, i18n } = useLingui();
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return null;
      }

      return {
        blockStyle: getBlockStyle(current),
        isLink: current.isActive('link'),
        active: {
          bold: current.isActive('bold'),
          italic: current.isActive('italic'),
          strike: current.isActive('strike'),
          bulletList: current.isActive('bulletList'),
          orderedList: current.isActive('orderedList'),
          codeBlock: current.isActive('codeBlock'),
          blockquote: current.isActive('blockquote'),
          undo: false,
          redo: false,
        } satisfies Record<ToolKey, boolean>,
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  const renderTool = ({ key, icon, label, isPcOnly }: Tool) => {
    const isActive = state?.active[key] ?? false;
    const isUnavailable =
      (key === 'undo' && !state?.canUndo) ||
      (key === 'redo' && !state?.canRedo);
    const isToggle = key !== 'undo' && key !== 'redo';

    return (
      <button
        key={key}
        type="button"
        aria-label={i18n._(label)}
        aria-pressed={isToggle ? isActive : undefined}
        disabled={isDisabled || !editor || isUnavailable}
        onClick={() => editor && runTool(editor, key)}
        className={`${isActive ? ACTIVE_TOOL_BUTTON_CLASS : TOOL_BUTTON_CLASS} ${
          isPcOnly ? 'max-pc:hidden' : ''
        }`}
      >
        <Image
          src={`/images/studio/${icon}.svg`}
          alt=""
          width={17}
          height={17}
        />
      </button>
    );
  };

  return (
    <div
      role="toolbar"
      aria-label={t`편집 서식`}
      className="relative flex h-11.5 shrink-0 items-center gap-0.5 border-y border-line px-1 pc:gap-1.5 pc:px-3"
    >
      <BlockStyleMenu
        editor={editor}
        current={state?.blockStyle ?? 'paragraph'}
        isDisabled={isDisabled}
      />
      <span aria-hidden="true" className="h-4.5 w-px shrink-0 bg-line" />
      {FORMAT_TOOLS.map(renderTool)}
      <LinkMenu
        editor={editor}
        isActive={state?.isLink ?? false}
        isDisabled={isDisabled}
      />
      <ImageInsertButton
        isDisabled={isDisabled || !editor}
        onFiles={onInsertImages}
      />
      {BLOCK_TOOLS.map(renderTool)}
    </div>
  );
};

export default EditorToolbar;
