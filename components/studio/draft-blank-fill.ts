import { Extension, type Editor, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import { Mapping, type Mappable } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { insertsNode } from '@/components/studio/editor-images';
import { isUuid } from '@/lib/images/rules';
import type { BlankFillLock } from '@/lib/studio/blank-fill-state';

/**
 * 편집기 빈칸의 AI 다듬기 상태 (ProseMirror 플러그인)
 * - 다듬는 중인 빈칸 id·다듬기 막음·빈칸 안내는 화면 상태라 문서 속성에 저장하지 않고 플러그인 상태로 둠
 * - 빈칸마다 노드 장식(spec)으로 상태를 실어, 상태가 바뀌면 빈칸 노드 뷰의 update 가 불림
 * - 다듬는 중인 빈칸을 건드리는 변경은 막음 (결과 넣기만 허용)
 * - 빈칸이 들어오는 변경(붙여넣기 등) 뒤에는 빈칸 id 가 비거나 겹치지 않게 정리
 */

const BLANK_NODE = 'draftBlank';

export interface BlankFillNotice {
  blankId: string;
  message: string;
}

export interface BlankFillUiState extends BlankFillLock {
  // 빈칸 아래에 보일 안내 (다듬기 실패 등)
  notice: BlankFillNotice | null;
}

// 빈칸 노드 뷰가 장식에서 읽는 그 빈칸의 상태
export interface BlankFillView {
  filling: boolean;
  busy: boolean;
  notice: string | null;
}

interface BlankFillMeta {
  ui?: Partial<BlankFillUiState>;
  // 다듬는 중인 빈칸에 결과를 넣는 변경 (잠금 검사를 건너뜀)
  allowLocked?: boolean;
}

interface BlankFillPluginState {
  ui: BlankFillUiState;
  decorations: DecorationSet;
}

const DEFAULT_UI: BlankFillUiState = {
  fillingBlankId: null,
  isBusy: false,
  notice: null,
};

const DEFAULT_VIEW: BlankFillView = {
  filling: false,
  busy: false,
  notice: null,
};

const blankFillKey = new PluginKey<BlankFillPluginState>('draftBlankFill');

interface BlankEntry {
  pos: number;
  node: ProseMirrorNode;
}

// 문서 안 빈칸 (문단 같은 글 블록 안은 훑지 않음, 빈칸 안에는 빈칸이 없음)
const collectBlanks = (doc: ProseMirrorNode): BlankEntry[] => {
  const blanks: BlankEntry[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === BLANK_NODE) {
      blanks.push({ pos, node });

      return false;
    }

    return !node.isTextblock;
  });

  return blanks;
};

const getBlankId = (node: ProseMirrorNode) =>
  typeof node.attrs.id === 'string' && isUuid(node.attrs.id)
    ? node.attrs.id
    : null;

/** id 로 빈칸 위치 찾기 (없으면 null) */
export const findBlankById = (
  doc: ProseMirrorNode,
  blankId: string,
): BlankEntry | null =>
  collectBlanks(doc).find(({ node }) => node.attrs.id === blankId) ?? null;

const buildDecorations = (doc: ProseMirrorNode, ui: BlankFillUiState) =>
  DecorationSet.create(
    doc,
    collectBlanks(doc).map(({ pos, node }) => {
      const id = node.attrs.id;
      const notice = ui.notice;

      // spec 값은 하나씩 === 로 비교되므로 객체를 넣지 않고 평평하게 둠
      return Decoration.node(
        pos,
        pos + node.nodeSize,
        {},
        {
          blankFill: true,
          filling: id !== null && id === ui.fillingBlankId,
          busy: ui.isBusy,
          notice:
            notice && id !== null && notice.blankId === id
              ? notice.message
              : null,
        },
      );
    }),
  );

/** 빈칸 노드 뷰가 받은 장식에서 그 빈칸의 다듬기 상태를 읽음 */
export const readBlankFillView = (
  decorations: readonly Decoration[],
): BlankFillView => {
  const spec = decorations.find((decoration) => decoration.spec.blankFill)
    ?.spec as (BlankFillView & { blankFill: true }) | undefined;

  return spec
    ? { filling: spec.filling, busy: spec.busy, notice: spec.notice }
    : DEFAULT_VIEW;
};

export const getBlankFillUi = (state: EditorState): BlankFillUiState =>
  blankFillKey.getState(state)?.ui ?? DEFAULT_UI;

/** 다듬기 상태 바꾸기 (문서는 그대로, 실행 취소 기록에 남기지 않음) */
export const setBlankFillUi = (
  editor: Editor,
  ui: Partial<BlankFillUiState>,
) => {
  if (editor.isDestroyed) {
    return;
  }

  const meta: BlankFillMeta = { ui };

  editor.view.dispatch(
    editor.state.tr.setMeta(blankFillKey, meta).setMeta('addToHistory', false),
  );
};

/**
 * id 가 비었거나 겹치는 빈칸에 붙일 새 id
 * - previous 가 있으면(붙여넣기 등) 변경 전부터 있던 빈칸이 id 를 지키고, 새로 들어온 쪽이 새 id 를 받음
 *   (다듬는 중인 빈칸이나 결과를 기다리는 빈칸의 id 가 바뀌지 않도록)
 * - 없으면 문서 앞쪽 빈칸이 id 를 지킴
 */
const planBlankIdFixes = (
  doc: ProseMirrorNode,
  previous?: { doc: ProseMirrorNode; mapping: Mappable },
  createId: () => string = () => crypto.randomUUID(),
): Array<{ entry: BlankEntry; id: string }> => {
  const blanks = collectBlanks(doc);
  // 변경 전 빈칸 id → 변경 후 위치
  const previousPositions = new Map<string, number>();

  for (const { pos, node } of previous ? collectBlanks(previous.doc) : []) {
    const id = getBlankId(node);

    if (id && !previousPositions.has(id)) {
      previousPositions.set(id, previous!.mapping.map(pos));
    }
  }

  const groups = new Map<string, BlankEntry[]>();
  const missing: BlankEntry[] = [];

  for (const entry of blanks) {
    const id = getBlankId(entry.node);

    if (id) {
      groups.set(id, [...(groups.get(id) ?? []), entry]);
    } else {
      missing.push(entry);
    }
  }

  const used = new Set(groups.keys());
  const renamed: BlankEntry[] = [...missing];

  for (const [id, entries] of groups) {
    if (entries.length < 2) {
      continue;
    }

    const keeper =
      entries.find(({ pos }) => pos === previousPositions.get(id)) ??
      entries[0];

    renamed.push(...entries.filter((entry) => entry !== keeper));
  }

  return renamed.map((entry) => {
    let id = createId();

    while (used.has(id)) {
      id = createId();
    }

    used.add(id);

    return { entry, id };
  });
};

const applyIdFixes = (
  tr: Transaction,
  fixes: Array<{ entry: BlankEntry; id: string }>,
) => {
  // 속성만 바꿔 위치가 밀리지 않음
  for (const { entry, id } of fixes) {
    tr.setNodeMarkup(entry.pos, undefined, { ...entry.node.attrs, id });
  }

  return tr;
};

/**
 * 편집기를 열 때 id 가 없거나 겹치는 빈칸에 id 를 붙임
 * - 실행 취소 기록에 남기지 않고, update 이벤트는 보내 자동 저장이 id 를 저장함
 * @returns 바꾼 빈칸이 있는지
 */
export const assignBlankIds = (editor: Editor): boolean => {
  if (editor.isDestroyed) {
    return false;
  }

  const fixes = planBlankIdFixes(editor.state.doc);

  if (fixes.length === 0) {
    return false;
  }

  const tr = applyIdFixes(editor.state.tr, fixes);

  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);

  return true;
};

/**
 * id 가 맞는 빈칸 하나를 문단들로 바꿈 (다듬는 중 잠금을 건너뜀, 실행 취소로 답을 되돌릴 수 있음)
 * - 빈칸이 없거나 문단이 이 문서 스키마에 맞지 않으면 아무것도 바꾸지 않고 false
 */
export const replaceBlankWithParagraphs = (
  editor: Editor,
  blankId: string,
  paragraphs: JSONContent[],
): boolean => {
  if (editor.isDestroyed || paragraphs.length === 0) {
    return false;
  }

  const target = findBlankById(editor.state.doc, blankId);

  if (!target) {
    return false;
  }

  try {
    const nodes = paragraphs.map((paragraph) =>
      editor.schema.nodeFromJSON(paragraph),
    );
    const meta: BlankFillMeta = { allowLocked: true };
    const tr = editor.state.tr
      .replaceWith(target.pos, target.pos + target.node.nodeSize, nodes)
      .setMeta(blankFillKey, meta);

    editor.view.dispatch(tr);

    return true;
  } catch {
    return false;
  }
};

/** 빈칸을 통째로 지움 (실행 취소로 되돌릴 수 있음, 빈칸이 아닌 위치는 false) */
export const removeDraftBlank = (editor: Editor, pos: number): boolean => {
  const node = editor.state.doc.nodeAt(pos);

  if (node?.type.name !== BLANK_NODE) {
    return false;
  }

  editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));

  return true;
};

// 변경이 [from, to] 범위 안을 바꾸는지 (범위 바로 앞뒤에 넣는 것은 괜찮음)
const touchesRange = (tr: Transaction, from: number, to: number) => {
  let start = from;
  let end = to;

  for (const map of tr.mapping.maps) {
    let touched = false;

    map.forEach((oldStart, oldEnd) => {
      touched ||= oldEnd > start && oldStart < end;
    });

    if (touched) {
      return true;
    }

    start = map.map(start, 1);
    end = map.map(end, -1);
  }

  return false;
};

export const createBlankFillExtension = () =>
  Extension.create({
    name: 'draftBlankFill',

    addProseMirrorPlugins() {
      return [
        new Plugin<BlankFillPluginState>({
          key: blankFillKey,
          state: {
            init: (_config, state) => ({
              ui: DEFAULT_UI,
              decorations: buildDecorations(state.doc, DEFAULT_UI),
            }),
            apply: (tr, value, _oldState, newState) => {
              const meta = tr.getMeta(blankFillKey) as
                | BlankFillMeta
                | undefined;

              if (!meta?.ui && !tr.docChanged) {
                return value;
              }

              const ui = meta?.ui ? { ...value.ui, ...meta.ui } : value.ui;

              return { ui, decorations: buildDecorations(newState.doc, ui) };
            },
          },
          props: {
            decorations: (state) => blankFillKey.getState(state)?.decorations,
          },
          // 다듬는 중인 빈칸은 결과 넣기 외의 변경을 받지 않음 (지우기·붙여 쓰기·전체 선택 후 지우기 등)
          filterTransaction: (tr, state) => {
            const meta = tr.getMeta(blankFillKey) as BlankFillMeta | undefined;
            const { fillingBlankId } = getBlankFillUi(state);

            if (!tr.docChanged || meta?.allowLocked || !fillingBlankId) {
              return true;
            }

            const target = findBlankById(state.doc, fillingBlankId);

            return (
              !target ||
              !touchesRange(tr, target.pos, target.pos + target.node.nodeSize)
            );
          },
          appendTransaction: (transactions, oldState, newState) => {
            if (
              !transactions.some(
                (tr) => tr.docChanged && insertsNode(tr, BLANK_NODE),
              )
            ) {
              return null;
            }

            const mapping = new Mapping();

            for (const tr of transactions) {
              mapping.appendMapping(tr.mapping);
            }

            const fixes = planBlankIdFixes(newState.doc, {
              doc: oldState.doc,
              mapping,
            });

            return fixes.length > 0 ? applyIdFixes(newState.tr, fixes) : null;
          },
        }),
      ];
    },
  });
