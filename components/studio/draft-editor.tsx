'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import type { JSONContent } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { getDraftStatusLabel } from '@/components/studio/draft-status';
import { createEditorExtensions } from '@/components/studio/editor-extensions';
import EditorToolbar from '@/components/studio/editor-toolbar';
import { useStudio } from '@/components/studio/studio-context';
import {
  BRAND_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
} from '@/components/studio/studio-styles';
import { saveDraftContent } from '@/lib/actions/studio';
import { countEmptyBlanks } from '@/lib/studio/draft-blank';
import type { StudioDraft } from '@/lib/studio/queries';

// 마지막 입력 후 이 시간이 지나면 자동 저장
const AUTOSAVE_DELAY = 1000;

type SaveState = 'idle' | 'pending' | 'saving' | 'error';

/**
 * 초안 본문 스타일 (Tailwind Typography 의 prose 를 편집기에만 적용)
 * - 글자 크기/색은 prose 요소 수식어로 디자인 값에 맞춤 (모바일 → pc: PC)
 * - 블록 사이 간격은 prose 기본 여백 대신 디자인 간격으로 통일 (제목 다음은 좁게)
 */
const PROSE_CLASS = [
  // flex-1: 내용이 짧아도 편집 가능 영역이 남는 높이를 채워, 빈 곳을 눌러도 편집기에 포커스
  'prose max-w-none flex-1 outline-none',
  // 색
  'prose-headings:font-bold prose-headings:text-ink prose-p:text-ink-muted prose-li:text-ink-muted prose-strong:text-ink prose-a:text-brand prose-li:marker:text-ink-faint',
  'prose-blockquote:border-line prose-blockquote:font-normal prose-blockquote:text-ink-muted prose-blockquote:not-italic',
  // 크기
  'prose-h1:text-[23px] prose-h1:leading-[1.5] prose-h1:tracking-[-0.8px] pc:prose-h1:text-[32px] pc:prose-h1:tracking-[-1px]',
  'prose-h2:text-[17px] prose-h2:leading-[1.5] prose-h2:tracking-[-0.4px] pc:prose-h2:text-[19px]',
  'prose-h3:text-[15px] prose-h3:leading-[1.5] pc:prose-h3:text-[17px]',
  // H4~H6: 단계마다 1px 씩 작게 (H5 는 본문과 같은 크기지만 굵기와 색으로, H6 은 본문보다 작게 구분)
  'prose-h4:text-[14px] prose-h4:leading-[1.5] pc:prose-h4:text-[16px]',
  'prose-h5:text-[13px] prose-h5:leading-[1.6] pc:prose-h5:text-[15px]',
  'prose-h6:text-[12px] prose-h6:leading-[1.6] pc:prose-h6:text-[14px]',
  'prose-p:text-[13px] prose-p:leading-[1.95] pc:prose-p:text-[15px]',
  'prose-li:text-[13px] prose-li:leading-[1.95] pc:prose-li:text-[15px] prose-li:my-1',
  'prose-blockquote:text-[13px] prose-blockquote:leading-[1.95] pc:prose-blockquote:text-[15px]',
  // 인라인 코드 (prose 기본 백틱 표시 제거)
  'prose-code:rounded prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:text-ink prose-code:before:content-none prose-code:after:content-none',
  // 블록 간격: 기본 26px(PC 24px), 문서 제목 다음 16px(18px), 소제목 다음 10px(8px), H3~H6 다음 8px
  '[&>*]:mb-0! [&>*]:mt-6.5! pc:[&>*]:mt-6! [&>h1+*]:mt-4! pc:[&>h1+*]:mt-4.5! [&>h2+*]:mt-2.5! pc:[&>h2+*]:mt-2! [&>:is(h3,h4,h5,h6)+*]:mt-2! [&>:first-child]:mt-0!',
  // 빈 줄 안내 문구 (Placeholder 확장)
  '[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0 [&_.is-empty]:before:text-ink-subtle [&_.is-empty]:before:content-[attr(data-placeholder)]',
].join(' ');

// 파일 이름에 쓸 수 없는 문자 제거 (제목이 없으면 draft)
const toFileName = (title: string, extension: string) => {
  const base = title
    .replace(/[\\/:*?"<>|\n\r]+/g, ' ')
    .trim()
    .slice(0, 80);

  return `${base || 'draft'}.${extension}`;
};

const downloadFile = (fileName: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * 편집기 내용을 서버에 자동 저장
 * - 입력이 멈추고 AUTOSAVE_DELAY 가 지나면 저장, 저장 중 다시 입력하면 끝난 뒤 이어서 저장
 * - 화면을 떠날 때 저장하지 않은 내용이 있으면 바로 저장 요청
 */
const useDraftAutosave = (repositoryId: string, draftId: string | null) => {
  const { setDraftTitle, isDraftRemoved } = useStudio();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const pendingRef = useRef<JSONContent | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const isSavingRef = useRef(false);

  const flush = useCallback(async () => {
    window.clearTimeout(timerRef.current);

    if (!draftId || !pendingRef.current || isSavingRef.current) {
      return;
    }

    // 삭제한 초안은 남은 내용을 저장하지 않음
    if (isDraftRemoved(draftId)) {
      pendingRef.current = null;
      return;
    }

    const content = pendingRef.current;

    pendingRef.current = null;
    isSavingRef.current = true;
    setSaveState('saving');

    try {
      const result = await saveDraftContent(
        repositoryId,
        draftId,
        JSON.stringify(content),
      );

      if (result.status !== 'saved') {
        // 저장 중에 초안을 삭제했거나, AI 작성이 시작되어 잠긴 경우(본문이 결과로 바뀜)는 오류로 표시하지 않음
        setSaveState(
          isDraftRemoved(draftId) || result.status === 'locked'
            ? 'idle'
            : 'error',
        );
        return;
      }

      setDraftTitle(draftId, result.title);

      if (pendingRef.current) {
        isSavingRef.current = false;
        await flush();
        return;
      }

      setSaveState('idle');
    } catch {
      // 실패한 내용은 다음 입력 때 다시 저장되도록 되돌려 둠
      pendingRef.current ??= content;
      setSaveState('error');
    } finally {
      isSavingRef.current = false;
    }
  }, [repositoryId, draftId, setDraftTitle, isDraftRemoved]);

  const schedule = useCallback(
    (editor: Editor) => {
      pendingRef.current = editor.getJSON();
      setSaveState('pending');
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY);
    },
    [flush],
  );

  useEffect(() => {
    // 저장하지 않은 내용이 있으면 새로고침/탭 닫기 전에 확인
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRef.current || isSavingRef.current) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // 다른 초안으로 이동하면 남은 내용을 바로 저장
      void flush();
    };
  }, [flush]);

  return { saveState, schedule };
};

// AI 작성 중에는 읽기 전용 (잠금이 풀리면 다시 편집 가능)
const useEditorLock = (editor: Editor | null, isEditable: boolean) => {
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.isEditable !== isEditable) {
      // 편집 가능 여부만 바꾸고 update 이벤트는 보내지 않음
      // (보내면 자동 저장이 잠금 해제 직전의 옛 본문으로 방금 반영한 AI 결과를 덮어씀)
      editor.setEditable(isEditable, false);
    }
  }, [editor, isEditable]);
};

/**
 * AI 작성 결과가 본문에 반영되면(contentRevision 변경) 새 본문으로 교체
 * - 편집기는 초안이 바뀔 때만 다시 만들어지므로, 같은 초안의 새 본문은 여기서 넣음
 * - 사이드바 목록 제목도 새 제목으로 맞춤 (자동 저장으로 바꾼 제목보다 우선)
 */
const useAppliedContent = (
  editor: Editor | null,
  draft: StudioDraft | null,
) => {
  const { setDraftTitle } = useStudio();
  const revision = draft?.contentRevision ?? null;
  const appliedRevisionRef = useRef(revision);

  useEffect(() => {
    if (
      !editor ||
      editor.isDestroyed ||
      !draft ||
      revision === appliedRevisionRef.current
    ) {
      return;
    }

    appliedRevisionRef.current = revision;
    editor.commands.setContent(draft.content, { emitUpdate: false });
    setDraftTitle(draft.id, draft.title);
  }, [editor, draft, revision, setDraftTitle]);
};

// 작성하지 않은 빈칸 개수 (편집기 내용이 바뀔 때마다 갱신)
const useEmptyBlankCount = (editor: Editor | null) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const update = () => setCount(countEmptyBlanks(editor.getJSON()));

    // AI 결과로 본문을 바꿀 때는 update 이벤트가 없어 문서가 바뀐 트랜잭션을 따름
    const handleTransaction = ({
      transaction,
    }: {
      transaction: Transaction;
    }) => {
      if (transaction.docChanged) {
        update();
      }
    };

    update();
    editor.on('transaction', handleTransaction);

    return () => {
      editor.off('transaction', handleTransaction);
    };
  }, [editor]);

  return count;
};

interface DraftEditorProps {
  repositoryId: string;
  // null 이면 새 초안 (작성 요청을 보내기 전이라 편집 불가)
  draft: StudioDraft | null;
  // 편집기 아래쪽을 덮는 기본 옵션 패널 높이: 이만큼 여백을 둬 마지막 줄이 가리지 않게 함
  bottomInset: number;
  // 본문 스크롤 영역 (PC 에서 패널 높이가 바뀔 때 작업 영역이 스크롤 위치를 맞추는 데 사용)
  scrollAreaRef?: Ref<HTMLDivElement>;
  // AI 작성 중이라 읽기 전용
  isLocked: boolean;
}

// 커서가 화면 끝에 닿기 전에 스크롤할 간격 (px)
const CARET_SCROLL_MARGIN = 8;

/**
 * 초안 편집 영역: 상태와 내보내기/게시 버튼, 서식 툴바, Tiptap 편집기
 * - HTML / MD 버튼은 현재 내용을 파일로 내려받기
 * - 게시하기는 블로그 연동 전이라 디자인만 구현
 */
const DraftEditor = ({
  repositoryId,
  draft,
  bottomInset,
  scrollAreaRef,
  isLocked,
}: DraftEditorProps) => {
  const { t, i18n } = useLingui();
  const { saveState, schedule } = useDraftAutosave(
    repositoryId,
    draft?.id ?? null,
  );
  const extensions = useMemo(
    () =>
      createEditorExtensions({
        headingPlaceholder: t`제목`,
        paragraphPlaceholder: t`내용을 입력하세요`,
        codeBlock: { copy: t`코드 복사`, copied: t`복사했습니다` },
        blank: {
          kinds: {
            motivation: {
              label: t`계기`,
              fallback: t`이 부분에 작업 계기를 작성해 주세요`,
            },
            result: {
              label: t`결과·수치`,
              fallback: t`이 부분에 결과나 수치를 작성해 주세요`,
            },
            lesson: {
              label: t`배운 점`,
              fallback: t`이 부분에 배운 점을 작성해 주세요`,
            },
            detail: {
              label: t`설명 필요`,
              fallback: t`이 부분은 자세한 설명이 필요합니다`,
            },
          },
          done: t`완료`,
        },
        blankPlaceholder: t`여기에 직접 작성해 주세요`,
      }),
    [t],
  );

  // ProseMirror 가 커서를 화면 안으로 스크롤할 때마다 읽는 여백 객체
  // (편집기는 초안이 바뀔 때만 다시 만들어지므로, 패널 높이가 바뀌면 이 객체 값만 갱신)
  const scrollMarginRef = useRef({
    top: CARET_SCROLL_MARGIN,
    right: CARET_SCROLL_MARGIN,
    bottom: CARET_SCROLL_MARGIN,
    left: CARET_SCROLL_MARGIN,
  });

  useEffect(() => {
    scrollMarginRef.current.bottom = bottomInset + CARET_SCROLL_MARGIN;
  }, [bottomInset]);

  const editor = useEditor(
    {
      extensions,
      content: draft?.content ?? null,
      editable: Boolean(draft) && !isLocked,
      // 서버 렌더링 결과와 맞추기 위해 클라이언트에서 마운트한 뒤 생성
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: PROSE_CLASS,
          'aria-label': t`초안 본문`,
        },
        // 입력 중인 줄이 아래쪽 기본 옵션 패널에 가려지지 않도록 위로 스크롤
        scrollMargin: scrollMarginRef.current,
        scrollThreshold: scrollMarginRef.current,
      },
      // 사용자가 편집할 수 있을 때의 변경만 자동 저장 (잠금 중 본문 교체 등은 제외)
      onUpdate: ({ editor: current }) => {
        if (current.isEditable) {
          schedule(current);
        }
      },
    },
    [draft?.id],
  );

  const emptyBlankCount = useEmptyBlankCount(editor);

  useEditorLock(editor, Boolean(draft) && !isLocked);
  useAppliedContent(editor, draft);

  const title = draft?.title ?? '';
  // 작성하지 않은 빈칸이 있으면 내보내기 전에 확인 (취소하면 내보내지 않음)
  const confirmExport = () => {
    const count = countEmptyBlanks(editor?.getJSON() ?? {});

    return (
      count === 0 ||
      window.confirm(
        t`작성하지 않은 빈칸이 ${count}개 있어요. 그대로 내보낼까요?`,
      )
    );
  };
  const exportHtml = () => {
    if (editor && confirmExport()) {
      downloadFile(toFileName(title, 'html'), editor.getHTML(), 'text/html');
    }
  };
  const exportMarkdown = () => {
    if (editor && confirmExport()) {
      downloadFile(
        toFileName(title, 'md'),
        editor.getMarkdown(),
        'text/markdown',
      );
    }
  };

  return (
    <section
      aria-label={t`초안 편집`}
      className="flex flex-1 flex-col pc:min-h-0"
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 pc:h-15 pc:px-3">
        <p className="flex min-w-0 items-center gap-1.5 text-[12px] leading-[normal] text-ink-faint">
          {i18n._(
            getDraftStatusLabel(
              draft?.status ?? 'draft',
              draft?.visibility ?? null,
            ),
          )}
          <span aria-live="polite" className="truncate">
            {emptyBlankCount > 0 && <Trans>· 빈칸 {emptyBlankCount}개</Trans>}
            {saveState === 'saving' && <Trans>· 저장 중...</Trans>}
            {saveState === 'error' && (
              <span className="text-danger">
                <Trans>· 저장하지 못했습니다</Trans>
              </span>
            )}
          </span>
        </p>
        <div className="flex shrink-0 gap-1.25 pc:gap-2">
          <button
            type="button"
            disabled={!draft}
            onClick={exportHtml}
            aria-label={t`HTML 파일로 내보내기`}
            className={`h-8 font-mono text-[12px] leading-[normal] font-medium pc:h-8.5 ${OUTLINE_BUTTON_CLASS}`}
          >
            HTML
          </button>
          <button
            type="button"
            disabled={!draft}
            onClick={exportMarkdown}
            aria-label={t`마크다운 파일로 내보내기`}
            className={`h-8 font-mono text-[12px] leading-[normal] font-medium pc:h-8.5 ${OUTLINE_BUTTON_CLASS}`}
          >
            MD
          </button>
          {/* 블로그 게시 기능은 추후 구현 (지금은 버튼 모양만) */}
          <button
            type="button"
            disabled={!draft}
            className={`h-8 pc:h-8.5 ${BRAND_BUTTON_CLASS}`}
          >
            <Trans>게시하기</Trans>
          </button>
        </div>
      </div>
      <EditorToolbar editor={editor} isDisabled={!draft || isLocked} />
      {/* 모바일은 내용 높이가 최소 높이, 남는 높이가 있으면 채움 / PC 는 이 영역만 스크롤 */}
      <div
        ref={scrollAreaRef}
        style={{ scrollPaddingBottom: bottomInset }}
        className="flex flex-1 flex-col pc:min-h-0 pc:overflow-y-auto"
      >
        <div className="flex flex-1 flex-col pt-6.5 pb-8 pc:px-12 pc:pt-8.5 pc:pb-6">
          <div className="mx-auto flex w-full max-w-260 flex-1 flex-col">
            {draft ? (
              <EditorContent editor={editor} className="flex flex-1 flex-col" />
            ) : (
              <p className="py-16 text-center text-[13px] leading-[1.8] break-keep text-ink-faint pc:py-24 pc:text-[14px]">
                <Trans>
                  커밋 내역에서 커밋을 선택하고 작성 요청을 보내면
                  <br />
                  이곳에 초안이 만들어집니다.
                </Trans>
              </p>
            )}
          </div>
        </div>
        {/* 기본 옵션 패널이 덮는 높이만큼의 여백 */}
        <div
          aria-hidden="true"
          style={{ height: bottomInset }}
          className="shrink-0"
        />
      </div>
    </section>
  );
};

export default DraftEditor;
