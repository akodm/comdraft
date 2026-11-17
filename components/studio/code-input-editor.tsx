'use client';

import { useEffect, useRef } from 'react';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  insertNewlineAndIndent,
} from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
} from '@codemirror/view';

export interface CodeInputEditorProps {
  // 처음 보여 줄 코드 (편집기를 연 뒤에 바뀌어도 다시 넣지 않음)
  initialValue: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}

// 편집기 모양 (색은 디자인 토큰, 글꼴은 고정폭)
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '12px',
    backgroundColor: '#fff',
    color: 'var(--color-ink)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    lineHeight: '1.6',
  },
  '.cm-content': { padding: '8px 0' },
  '.cm-gutters': {
    backgroundColor: 'var(--color-panel)',
    color: 'var(--color-ink-subtle)',
    borderRight: '1px solid var(--color-line)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--color-surface)' },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-ink-muted)',
  },
  '.cm-placeholder': { color: 'var(--color-ink-subtle)' },
});

/**
 * 직접 입력 코드 편집기 (CodeMirror 6, 언어 확장 없이 텍스트만 편집)
 * - 줄 번호, 되돌리기, Tab 들여쓰기(Esc 다음 Tab 으로 편집기에서 빠져나감), Enter 때 들여쓰기 유지, 괄호 짝 표시
 * - 코드는 문자열로만 다루고 실행하거나 HTML 로 해석하지 않음
 * - 키 입력이 바깥 작성 요청 입력창으로 전달되지 않는 것은 감싸는 모달(CodeInputDialog)이 맡음
 */
const CodeInputEditor = ({
  initialValue,
  onChange,
  label,
  placeholder,
}: CodeInputEditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          indentOnInput(),
          bracketMatching(),
          EditorState.tabSize.of(2),
          keymap.of([
            { key: 'Enter', run: insertNewlineAndIndent },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          placeholderExtension(placeholder),
          EditorView.contentAttributes.of({
            'aria-label': label,
            'aria-multiline': 'true',
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          editorTheme,
        ],
      }),
    });

    view.focus();

    return () => view.destroy();
    // 편집기는 열 때 한 번만 만듦 (처음 값·문구가 바뀌어도 입력 중인 내용을 덮어쓰지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 overflow-hidden rounded border border-line focus-within:border-brand"
    />
  );
};

export default CodeInputEditor;
