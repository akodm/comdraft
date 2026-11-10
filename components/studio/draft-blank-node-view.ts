import type { Editor, NodeViewRenderer } from '@tiptap/core';
import { normalizeBlankAttrs, type BlankKind } from '@/lib/studio/draft-blank';

export interface DraftBlankLabels {
  kinds: Record<BlankKind, { label: string; fallback: string }>;
  done: string;
  // 빈칸 안 빈 문단의 안내 문구 (없으면 편집기 기본 문구)
  placeholder?: string;
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

/**
 * 편집기 빈칸 노드 뷰: 머리에 종류 라벨, 안내 문구, 완료 버튼
 * - 코드 블록 노드 뷰와 같은 ProseMirror 노드 뷰(DOM) 방식
 */
export const createDraftBlankNodeView =
  (labels: DraftBlankLabels): NodeViewRenderer =>
  ({ node: initialNode, editor, getPos, view }) => {
    let node = initialNode;

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
    const doneButton = createElement(
      'button',
      'shrink-0 rounded px-2 py-1 font-sans text-[11px] leading-[normal] font-medium text-brand hover:bg-brand/10 disabled:text-ink-faint disabled:hover:bg-transparent',
    );
    const content = createElement('div', 'min-w-0');

    // 빈칸 안 빈 문단은 편집기 Placeholder 대신 이 문구를 보여 줌 (draft-editor 의 PROSE_CLASS 에서 사용)
    content.dataset.blankContent = '';

    if (labels.placeholder) {
      dom.style.setProperty(
        '--blank-placeholder',
        JSON.stringify(labels.placeholder),
      );
    }

    header.contentEditable = 'false';
    icon.src = '/images/studio/pencil-line.svg';
    icon.alt = '';
    icon.width = 14;
    icon.height = 14;
    doneButton.type = 'button';
    doneButton.textContent = labels.done;

    title.append(icon, kindLabel, hint);
    header.append(title, doneButton);
    dom.append(header, content);

    const render = () => {
      const { kind, hint: hintText } = normalizeBlankAttrs(node.attrs);
      const { label, fallback } = labels.kinds[kind];

      dom.dataset.kind = kind;
      kindLabel.textContent = label;
      hint.textContent = hintText || fallback;
      // 편집 잠금 중(AI 작성 중)에는 완료할 수 없음
      doneButton.disabled = !editor.isEditable || !node.textContent.trim();
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

    // 버튼을 눌러도 편집기 커서가 움직이지 않도록 함
    doneButton.addEventListener('mousedown', (event) => event.preventDefault());
    doneButton.addEventListener('click', () => {
      if (!editor.isEditable) {
        return;
      }

      const pos = getPos();

      if (typeof pos === 'number') {
        liftDraftBlank(editor, pos);
      }
    });

    return {
      dom,
      contentDOM: content,
      update: (updatedNode) => {
        if (updatedNode.type !== node.type) {
          return false;
        }

        node = updatedNode;
        render();

        return true;
      },
      destroy: () => editableObserver.disconnect(),
      // 머리글은 편집 대상이 아님
      stopEvent: (event) => header.contains(event.target as Node),
      ignoreMutation: (mutation) =>
        mutation.type !== 'selection' && header.contains(mutation.target),
    };
  };
