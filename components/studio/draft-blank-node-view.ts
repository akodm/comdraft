import type { Editor, NodeViewRenderer } from '@tiptap/core';
import {
  readBlankFillView,
  removeDraftBlank,
} from '@/components/studio/draft-blank-fill';
import { getBlankButtonState } from '@/lib/studio/blank-fill-state';
import {
  getBlankAnswer,
  normalizeBlankAttrs,
  type BlankKind,
} from '@/lib/studio/draft-blank';

export interface DraftBlankLabels {
  kinds: Record<BlankKind, { label: string; fallback: string }>;
  // 버튼: AI 로 다듬기 / 그대로 넣기 / 지우기
  fill: string;
  insert: string;
  remove: string;
  // 다듬는 중 표시
  filling: string;
  // 답이 최대 길이를 넘었을 때 안내
  tooLong: string;
  // 빈칸 안 빈 문단의 안내 문구 (없으면 편집기 기본 문구)
  placeholder?: string;
}

export interface DraftBlankHandlers {
  // AI 로 다듬기를 누름 (그 빈칸 id)
  onFill?: (blankId: string) => void;
}

/**
 * 빈칸을 풀어 안의 문단만 일반 본문으로 남김
 * - 글자가 없는 빈칸이나 빈칸이 아닌 위치는 그대로 두고 false
 */
export const liftDraftBlank = (editor: Editor, pos: number): boolean => {
  const node = editor.state.doc.nodeAt(pos);

  if (node?.type.name !== 'draftBlank' || !node.textContent.trim()) {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr.replaceWith(pos, pos + node.nodeSize, node.content),
  );

  return true;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
) => {
  const element = document.createElement(tag);

  element.className = className;

  return element;
};

const BUTTON_CLASS =
  'shrink-0 rounded px-2 py-1 font-sans text-[11px] leading-[normal] font-medium hover:bg-brand/10 disabled:text-ink-faint disabled:hover:bg-transparent';

/**
 * 편집기 빈칸 노드 뷰: 머리에 종류 라벨·안내 문구, 아래에 안내와 버튼 (AI 로 다듬기 / 그대로 넣기 / 지우기)
 * - 코드 블록 노드 뷰와 같은 ProseMirror 노드 뷰(DOM) 방식
 * - 다듬기 상태는 draft-blank-fill 플러그인이 노드 장식으로 넘김: 다듬는 중이면 안을 편집할 수 없고
 *   "다듬는 중" 표시와 함께 버튼을 숨김
 */
export const createDraftBlankNodeView =
  (
    labels: DraftBlankLabels,
    handlers: DraftBlankHandlers = {},
  ): NodeViewRenderer =>
  ({ node: initialNode, editor, getPos, view, decorations }) => {
    let node = initialNode;
    let fill = readBlankFillView(decorations);

    const dom = createElement(
      'div',
      'not-prose flex flex-col gap-2.5 rounded border border-brand/40 bg-brand/5 p-3.5 pc:p-5',
    );
    const header = createElement(
      'div',
      'flex items-center justify-between gap-3 select-none',
    );
    const title = createElement('span', 'flex min-w-0 items-center gap-1.5');
    const icon = createElement('img', 'block shrink-0');
    const kindLabel = createElement(
      'span',
      'shrink-0 font-sans text-[11px] leading-[normal] font-semibold text-ink-muted',
    );
    const hint = createElement(
      'span',
      'truncate font-sans text-[11px] leading-[normal] text-ink-faint',
    );
    // 다듬는 중 표시 (스피너 + 문구)
    const status = createElement(
      'span',
      'flex shrink-0 items-center gap-1.5 font-sans text-[11px] leading-[normal] font-medium text-brand',
    );
    const spinner = createElement(
      'span',
      'size-3 animate-spin rounded-full border-2 border-brand border-t-transparent',
    );
    const statusText = createElement('span', '');
    const content = createElement('div', 'min-w-0');
    const footer = createElement(
      'div',
      'flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 select-none',
    );
    const notice = createElement(
      'p',
      'min-w-0 font-sans text-[11px] leading-[1.6] break-keep text-danger',
    );
    const actions = createElement(
      'div',
      'ml-auto flex shrink-0 items-center gap-1',
    );
    const fillButton = createElement('button', `${BUTTON_CLASS} text-brand`);
    const insertButton = createElement(
      'button',
      `${BUTTON_CLASS} text-ink-muted`,
    );
    const removeButton = createElement(
      'button',
      `${BUTTON_CLASS} text-ink-muted`,
    );

    // 빈칸 안 빈 문단은 편집기 Placeholder 대신 이 문구를 보여 줌 (draft-editor 의 PROSE_CLASS 에서 사용)
    content.dataset.blankContent = '';

    if (labels.placeholder) {
      dom.style.setProperty(
        '--blank-placeholder',
        JSON.stringify(labels.placeholder),
      );
    }

    header.contentEditable = 'false';
    footer.contentEditable = 'false';
    icon.src = '/images/studio/pencil-line.svg';
    icon.alt = '';
    icon.width = 14;
    icon.height = 14;
    spinner.setAttribute('aria-hidden', 'true');
    statusText.textContent = labels.filling;
    status.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');

    for (const [button, label] of [
      [fillButton, labels.fill],
      [insertButton, labels.insert],
      [removeButton, labels.remove],
    ] as const) {
      button.type = 'button';
      button.textContent = label;
      // 버튼을 눌러도 편집기 커서가 움직이지 않도록 함
      button.addEventListener('mousedown', (event) => event.preventDefault());
    }

    title.append(icon, kindLabel, hint);
    status.append(spinner, statusText);
    header.append(title, status);
    actions.append(fillButton, insertButton, removeButton);
    footer.append(notice, actions);
    dom.append(header, content, footer);

    const render = () => {
      const { kind, hint: hintText } = normalizeBlankAttrs(node.attrs);
      const { label, fallback } = labels.kinds[kind];
      const buttons = getBlankButtonState({
        answer: getBlankAnswer(node.toJSON()),
        // 편집 잠금 중(AI 작성 중)에는 버튼을 쓸 수 없음
        isEditable: editor.isEditable,
        isBusy: fill.busy,
      });
      // 다듬는 중에는 안내를 감추고, 답이 너무 길면 그 안내가 먼저
      const tooLongMessage = buttons.isTooLong ? labels.tooLong : null;
      const message = fill.filling ? null : (tooLongMessage ?? fill.notice);

      dom.dataset.kind = kind;
      kindLabel.textContent = label;
      hint.textContent = hintText || fallback;
      fillButton.disabled = !buttons.canFill;
      insertButton.disabled = !buttons.canInsert;
      removeButton.disabled = !buttons.canRemove;

      // 다듬는 중: 그 빈칸만 편집할 수 없고 버튼 대신 "다듬는 중" 표시
      dom.setAttribute('aria-busy', String(fill.filling));
      status.hidden = !fill.filling;
      actions.hidden = fill.filling;
      content.classList.toggle('opacity-60', fill.filling);

      if (fill.filling) {
        content.contentEditable = 'false';
      } else {
        content.removeAttribute('contenteditable');
      }

      notice.textContent = message ?? '';
      notice.hidden = !message;
      footer.hidden = fill.filling && !message;
    };

    render();

    // 편집 가능 여부만 바뀌면 노드 뷰 update 가 불리지 않으므로,
    // ProseMirror 가 편집기 DOM 에 반영하는 contenteditable 속성 변경을 보고 다시 그림
    // (노드 뷰를 처음 만들 때는 editor.view 가 아직 없어 인자로 받은 view 를 씀)
    const editableObserver = new MutationObserver(render);

    editableObserver.observe(view.dom, {
      attributes: true,
      attributeFilter: ['contenteditable'],
    });

    // 다듬는 중이거나 편집 잠금 중이면 버튼이 아무것도 하지 않음
    const canAct = () => editor.isEditable && !fill.filling;

    fillButton.addEventListener('click', () => {
      const id = node.attrs.id;

      if (canAct() && !fillButton.disabled && typeof id === 'string') {
        handlers.onFill?.(id);
      }
    });
    insertButton.addEventListener('click', () => {
      const pos = getPos();

      if (canAct() && typeof pos === 'number') {
        liftDraftBlank(editor, pos);
      }
    });
    removeButton.addEventListener('click', () => {
      const pos = getPos();

      if (canAct() && typeof pos === 'number') {
        removeDraftBlank(editor, pos);
      }
    });

    // 머리글·아래 줄은 편집 대상이 아님
    const isChrome = (target: Node) =>
      header.contains(target) || footer.contains(target);

    return {
      dom,
      contentDOM: content,
      update: (updatedNode, updatedDecorations) => {
        if (updatedNode.type !== node.type) {
          return false;
        }

        node = updatedNode;
        fill = readBlankFillView(updatedDecorations);
        render();

        return true;
      },
      destroy: () => editableObserver.disconnect(),
      stopEvent: (event) => isChrome(event.target as Node),
      // 머리글·아래 줄과, 이 노드 뷰가 바꾸는 속성(다듬는 중 표시)은 ProseMirror 가 다시 읽지 않음
      ignoreMutation: (mutation) =>
        mutation.type === 'selection'
          ? false
          : isChrome(mutation.target) ||
            (mutation.type === 'attributes' &&
              (mutation.target === dom || mutation.target === content)),
    };
  };
