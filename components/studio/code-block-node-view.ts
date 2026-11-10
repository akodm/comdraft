import type { NodeViewRenderer } from '@tiptap/core';

// 코드 블록 언어 표시 이름 (```ts 처럼 짧게 쓴 언어도 같은 이름으로)
const LANGUAGE_NAMES: Record<string, string> = {
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  javascript: 'JavaScript',
  jsx: 'JSX',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sh: 'Shell',
  bash: 'Shell',
  shell: 'Shell',
  zsh: 'Shell',
  py: 'Python',
  python: 'Python',
  sql: 'SQL',
  go: 'Go',
  rs: 'Rust',
  rust: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  kotlin: 'Kotlin',
  swift: 'Swift',
  yml: 'YAML',
  yaml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
};

export const getLanguageName = (language: unknown) => {
  if (typeof language !== 'string' || !language) {
    return 'Code';
  }

  return LANGUAGE_NAMES[language.toLowerCase()] ?? language;
};

// 복사 완료 표시 유지 시간
const COPIED_DURATION = 1500;

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
) => {
  const element = document.createElement(tag);

  element.className = className;

  return element;
};

export interface CodeBlockLabels {
  copy: string;
  copied: string;
}

/**
 * 편집기 코드 블록 노드 뷰: 상단에 언어 이름과 복사 버튼
 * - React 노드 뷰는 다음 렌더링에 그려져 코드 블록을 만든 직후 커서가 다른 문단에 남는 문제가 있어
 *   ProseMirror 노드 뷰(DOM)로 바로 그림
 * - 언어는 마크다운 펜스(```ts)나 붙여 넣은 HTML 의 language-* 클래스에서 가져옴
 */
export const createCodeBlockNodeView =
  (labels: CodeBlockLabels): NodeViewRenderer =>
  ({ node: initialNode }) => {
    let node = initialNode;
    let copiedTimer: number | undefined;

    const dom = createElement(
      'div',
      'not-prose flex flex-col gap-3 rounded bg-surface p-3.5 pc:p-5',
    );
    const header = createElement(
      'div',
      'flex items-center justify-between gap-3 select-none',
    );
    const language = createElement(
      'span',
      'font-mono text-[10px] leading-[normal] text-ink-faint',
    );
    const actions = createElement('span', 'flex items-center gap-1.5');
    const status = createElement(
      'span',
      'font-sans text-[10px] leading-[normal] text-ink-faint',
    );
    const copyButton = createElement(
      'button',
      '-m-1 flex size-5.5 shrink-0 items-center justify-center rounded hover:bg-line/50',
    );
    const copyIcon = createElement('img', 'block');
    const pre = createElement(
      'pre',
      'overflow-x-auto font-mono text-[11px] leading-[1.8] text-ink pc:text-[13px]',
    );
    const code = document.createElement('code');

    header.contentEditable = 'false';
    language.textContent = getLanguageName(node.attrs.language);
    status.setAttribute('aria-live', 'polite');
    copyButton.type = 'button';
    copyButton.setAttribute('aria-label', labels.copy);
    copyIcon.src = '/images/studio/copy.svg';
    copyIcon.alt = '';
    copyIcon.width = 14;
    copyIcon.height = 14;

    copyButton.append(copyIcon);
    actions.append(status, copyButton);
    header.append(language, actions);
    pre.append(code);
    dom.append(header, pre);

    // 버튼을 눌러도 편집기 커서가 움직이지 않도록 함
    copyButton.addEventListener('mousedown', (event) => event.preventDefault());
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(node.textContent);
        status.textContent = labels.copied;
        window.clearTimeout(copiedTimer);
        copiedTimer = window.setTimeout(() => {
          status.textContent = '';
        }, COPIED_DURATION);
      } catch {
        // 클립보드 권한이 없으면 복사하지 않음 (사용자가 직접 선택해서 복사 가능)
      }
    });

    return {
      dom,
      contentDOM: code,
      update: (updatedNode) => {
        if (updatedNode.type !== node.type) {
          return false;
        }

        node = updatedNode;
        language.textContent = getLanguageName(node.attrs.language);

        return true;
      },
      // 머리글(언어, 복사 버튼)은 편집 대상이 아님
      stopEvent: (event) => header.contains(event.target as Node),
      ignoreMutation: (mutation) =>
        mutation.type !== 'selection' && header.contains(mutation.target),
      destroy: () => window.clearTimeout(copiedTimer),
    };
  };
