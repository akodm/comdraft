import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { UploadedImage } from '@/components/studio/image-upload';

/**
 * 편집기 안 이미지 노드 다루기 (ProseMirror 트랜잭션으로 바꿔 커서와 실행 취소 기록을 지킴)
 */

const IMAGE_NODE = 'image';

// 조건에 맞는 이미지 노드의 위치 (문서 앞에서부터)
const findImages = (
  doc: ProseMirrorNode,
  match: (src: string) => boolean,
): Array<{ pos: number; node: ProseMirrorNode }> => {
  const found: Array<{ pos: number; node: ProseMirrorNode }> = [];

  doc.descendants((node, pos) => {
    if (node.type.name === IMAGE_NODE) {
      if (typeof node.attrs.src === 'string' && match(node.attrs.src)) {
        found.push({ pos, node });
      }

      return false;
    }

    return true;
  });

  return found;
};

/**
 * src 로 찾은 이미지 노드를 올린 결과로 바꾸거나(값) 지움(null)
 * - 실행 취소 기록에 남기지 않음: 되돌려도 이미 지운 blob 주소로 돌아가지 않도록
 * - 기본은 update 이벤트를 보내지 않음 (자동 저장이 같은 결과를 이미 저장 본문에 반영함)
 */
export const applyImageChanges = (
  editor: Editor,
  changes: ReadonlyMap<string, UploadedImage | null>,
  { emitUpdate = false }: { emitUpdate?: boolean } = {},
) => {
  if (editor.isDestroyed) {
    return;
  }

  const { state } = editor;
  const targets = findImages(state.doc, (src) => changes.has(src));

  if (targets.length === 0) {
    return;
  }

  const tr = state.tr;

  // 뒤에서부터 바꿔 앞쪽 위치가 밀리지 않게 함
  for (const { pos, node } of targets.reverse()) {
    const change = changes.get(node.attrs.src as string);

    if (change) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...change });
    } else {
      tr.delete(pos, pos + node.nodeSize);
    }
  }

  tr.setMeta('addToHistory', false);
  tr.setMeta('preventUpdate', !emitUpdate);
  editor.view.dispatch(tr);
};

// 트랜잭션이 이 종류의 노드를 넣는지 (글자 입력처럼 해당 노드가 없는 변경은 문서를 훑지 않음)
export const insertsNode = (tr: Transaction, typeName: string) =>
  tr.steps.some((step) => {
    const slice = (step as { slice?: { content: ProseMirrorNode['content'] } })
      .slice;
    let found = false;

    slice?.content.descendants((node) => {
      found ||= node.type.name === typeName;

      return !found;
    });

    return found;
  });

const insertsImage = (tr: Transaction) => insertsNode(tr, IMAGE_NODE);

/**
 * 붙여넣기의 HTML 에 글자가 없을 때만 파일로 넣음
 * - 이미지 복사·스크린샷: 파일만 있거나 HTML 이 img 하나 → 파일로 올림
 * - 문서·표 복사: 글자와 함께 그림 파일이 딸려 오므로 기본 붙여넣기 (글자를 살림)
 */
export const shouldPasteFiles = (files: File[], html: string) => {
  if (files.length === 0) {
    return false;
  }

  if (!html) {
    return true;
  }

  const text = new DOMParser().parseFromString(html, 'text/html').body
    .textContent;

  return !text?.trim();
};

export interface ImageInputHandlers {
  // 붙여넣거나 끌어다 놓은 파일 (pos 가 없으면 현재 선택 위치)
  onFiles: (editor: Editor, files: File[], pos?: number) => void;
  // 편집기에 남길 수 있는 이미지 주소 (우리 공개 버킷 또는 대기 중·올린 blob)
  isAllowedSrc: (src: string) => boolean;
}

/**
 * 이미지 파일 붙여넣기·끌어다 놓기와, 들어온 이미지 주소 거르기
 * - 외부 주소·다른 탭의 blob 이미지는 저장할 때 서버가 지워 갑자기 사라지므로 들어오는 즉시 지움
 */
export const createImageInputExtension = (handlers: ImageInputHandlers) =>
  Extension.create({
    name: 'imageInput',

    addProseMirrorPlugins() {
      const { editor } = this;

      return [
        new Plugin({
          key: new PluginKey('imageInput'),
          props: {
            handlePaste: (view, event) => {
              const files = Array.from(event.clipboardData?.files ?? []);

              if (
                !shouldPasteFiles(
                  files,
                  event.clipboardData?.getData('text/html') ?? '',
                )
              ) {
                return false;
              }

              event.preventDefault();

              if (view.editable) {
                handlers.onFiles(editor, files);
              }

              return true;
            },
            handleDrop: (view, event, _slice, moved) => {
              const files = Array.from(event.dataTransfer?.files ?? []);

              // 편집기 안에서 옮기는 것은 기본 동작
              if (moved || files.length === 0) {
                return false;
              }

              // 브라우저가 파일을 새 화면으로 여는 것을 막음
              event.preventDefault();

              if (view.editable) {
                const pos = view.posAtCoords({
                  left: event.clientX,
                  top: event.clientY,
                })?.pos;

                handlers.onFiles(editor, files, pos);
              }

              return true;
            },
          },
          appendTransaction: (transactions, _oldState, newState) => {
            if (!transactions.some(insertsImage)) {
              return null;
            }

            const targets = findImages(
              newState.doc,
              (src) => !handlers.isAllowedSrc(src),
            );

            if (targets.length === 0) {
              return null;
            }

            const tr = newState.tr;

            for (const { pos, node } of targets.reverse()) {
              tr.delete(pos, pos + node.nodeSize);
            }

            return tr;
          },
        }),
      ];
    },
  });
