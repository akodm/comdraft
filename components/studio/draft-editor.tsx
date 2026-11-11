'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from 'react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import type { JSONContent } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { assignBlankIds } from '@/components/studio/draft-blank-fill';
import { getDraftStatusLabel } from '@/components/studio/draft-status';
import { createEditorExtensions } from '@/components/studio/editor-extensions';
import EditorToolbar from '@/components/studio/editor-toolbar';
import {
  collectBlobSrcs,
  IMAGE_RETRY_DELAY,
  planImageRetry,
} from '@/components/studio/image-upload';
import { useStudio } from '@/components/studio/studio-context';
import PublishActions from '@/components/studio/publish-actions';
import { PROSE_CLASS } from '@/components/shared/prose';
import { resolvePublishState } from '@/components/studio/publish-state';
import { OUTLINE_BUTTON_CLASS } from '@/components/studio/studio-styles';
import { useBlankFill } from '@/hooks/use-blank-fill';
import type { BlankFillResult } from '@/hooks/use-generation-job';
import { usePendingImages, type ImageNotice } from '@/hooks/use-pending-images';
import { saveDraftContent } from '@/lib/actions/studio';
import type { GenerationJobView } from '@/lib/generation/jobs';
import { countEmptyBlanks } from '@/lib/studio/draft-blank';
import type { StudioDraft } from '@/lib/studio/queries';

// 마지막 입력 후 이 시간이 지나면 자동 저장
const AUTOSAVE_DELAY = 1000;

type SaveState = 'idle' | 'pending' | 'saving' | 'error';

// 저장 직전에 본문을 손봄 (blob 이미지를 올려 공개 주소로 바꾸고, 못 올린 것은 뺌)
type PrepareContent = (
  draftId: string,
  content: JSONContent,
  editor: Editor | null,
) => Promise<JSONContent>;

const IMAGE_NOTICE_MESSAGES: Record<ImageNotice, MessageDescriptor> = {
  heic: msg`HEIC 형식은 지원하지 않습니다`,
  type: msg`JPEG, PNG, WebP, GIF, AVIF 이미지만 넣을 수 있습니다`,
  size: msg`이미지는 한 장에 5MB 까지 넣을 수 있습니다`,
  limit: msg`초안 하나에 이미지는 10장까지 넣을 수 있습니다`,
  too_large: msg`이미지 해상도가 너무 큽니다`,
  failed: msg`이미지를 올리지 못했습니다. 다시 시도합니다`,
  unuploaded: msg`올리지 못한 이미지가 있습니다`,
};

// 편집기 안 이미지 (본문 폭까지, 선택하면 테두리)
const EDITOR_IMAGE_CLASS =
  '[&_img]:h-auto [&_img]:max-w-full [&_img.ProseMirror-selectednode]:outline-2 [&_img.ProseMirror-selectednode]:outline-offset-2 [&_img.ProseMirror-selectednode]:outline-brand';

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
 * - 저장 직전에 prepareContent 로 본문의 이미지를 올림 (올리는 동안 입력한 내용은 끝난 뒤 이어서 저장)
 * - 저장한 뒤에도 편집기에 못 올린 blob 이미지가 남으면 잠시 뒤 다시 올려 저장
 *   (blob 한 장당 정해진 횟수까지, 새로 입력하면 횟수를 비움)
 * - 화면을 떠날 때 못 올린 blob 이미지만 남았어도 마지막으로 한 번 올려 저장
 * - 대기 중인 내용을 모두 저장하고 끝나면 onSavedRef 를 부름 (빈칸 채우기 반영 표시)
 */
const useDraftAutosave = (
  repositoryId: string,
  draftId: string | null,
  prepareContent: PrepareContent,
  onSavedRef?: RefObject<(() => void) | null>,
) => {
  const { setDraftTitle, setDraftStatus, isDraftRemoved } = useStudio();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const pendingRef = useRef<JSONContent | null>(null);
  // 저장할 본문을 만든 편집기 (올린 이미지 주소를 편집기에도 반영)
  const editorRef = useRef<Editor | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  // 진행 중인 저장 (게시 전에 끝날 때까지 기다리거나, 중복 저장을 막는 데 사용)
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  // 못 올린 blob 이미지를 다시 올리는 타이머와 blob 마다의 시도 횟수
  const retryTimerRef = useRef<number | undefined>(undefined);
  const retryAttemptsRef = useRef(new Map<string, number>());

  /**
   * 대기 중인 내용이 없을 때까지 차례로 저장 (저장 중 새로 입력한 내용은 끝난 뒤 이어서 저장)
   * @returns 모두 저장하고 끝났는지 (삭제·잠금·오류로 멈추면 false)
   */
  const saveUntilIdle = useCallback(async (): Promise<boolean> => {
    while (draftId && pendingRef.current) {
      // 삭제한 초안은 남은 내용을 저장하지 않음
      if (isDraftRemoved(draftId)) {
        pendingRef.current = null;
        return false;
      }

      const content = pendingRef.current;

      pendingRef.current = null;
      setSaveState('saving');

      try {
        const savable = await prepareContent(
          draftId,
          content,
          editorRef.current,
        );
        const result = await saveDraftContent(
          repositoryId,
          draftId,
          JSON.stringify(savable),
        );

        if (result.status !== 'saved') {
          // 저장 중에 초안을 삭제했거나, AI 작성이 시작되어 잠긴 경우(본문이 결과로 바뀜)는 오류로 표시하지 않음
          setSaveState(
            isDraftRemoved(draftId) || result.status === 'locked'
              ? 'idle'
              : 'error',
          );
          return false;
        }

        setDraftTitle(draftId, result.title);
        setDraftStatus(draftId, result.draftStatus);
      } catch {
        // 실패한 내용은 다음 입력 때 다시 저장되도록 되돌려 둠
        pendingRef.current ??= content;
        setSaveState('error');
        return false;
      }
    }

    setSaveState('idle');
    return true;
  }, [
    repositoryId,
    draftId,
    prepareContent,
    setDraftTitle,
    setDraftStatus,
    isDraftRemoved,
  ]);

  /**
   * 대기 중인 내용을 바로 저장
   * @returns 대기 내용까지 모두 저장했는지 (대기 내용이 없으면 true)
   */
  const flush = useCallback((): Promise<boolean> => {
    window.clearTimeout(timerRef.current);

    // 저장 중이면 그 저장이 끝난 뒤 대기 내용까지 이어서 저장함
    if (inFlightRef.current || !pendingRef.current) {
      return inFlightRef.current ?? Promise.resolve(true);
    }

    window.clearTimeout(retryTimerRef.current);

    // 이 초안의 편집기 (저장이 끝나기 전에 초안을 바꿔도 새 초안의 편집기를 보지 않도록 지금 잡아 둠)
    const editor = editorRef.current;

    // 저장을 마친 뒤 편집기에 못 올린 blob 이미지가 남았으면 잠시 뒤 이 초안에 다시 저장
    const scheduleImageRetry = () => {
      if (!editor || editor.isDestroyed || !editor.isEditable) {
        return;
      }

      const plan = planImageRetry(
        collectBlobSrcs(editor.getJSON()),
        retryAttemptsRef.current,
      );

      retryAttemptsRef.current = plan.attempts;

      if (!plan.retry) {
        return;
      }

      retryTimerRef.current = window.setTimeout(() => {
        // 그 사이 입력해 대기 중인 저장이 있으면 그 저장이 이미지를 올림
        // AI 작성으로 잠긴 동안에는 저장하지 않음 (반영 전 결과를 이전 본문으로 덮지 않도록)
        if (editor.isDestroyed || !editor.isEditable || pendingRef.current) {
          return;
        }

        pendingRef.current = editor.getJSON();
        void flush();
      }, IMAGE_RETRY_DELAY);
    };

    const task = saveUntilIdle()
      .finally(() => {
        inFlightRef.current = null;
      })
      .then((isSaved) => {
        if (isSaved) {
          scheduleImageRetry();
          onSavedRef?.current?.();
        }

        return isSaved;
      });

    inFlightRef.current = task;

    return task;
  }, [saveUntilIdle, onSavedRef]);

  /**
   * 게시 직전에 자동 저장과 겹치지 않도록 정리
   * - 게시가 현재 본문을 그대로 저장하므로, 대기 중인 저장은 타이머와 함께 버림
   * - 이미 서버에 가는 중인 저장은 끝날 때까지 기다림: 그래야 옛 본문 저장이 게시보다 늦게 도착해
   *   게시한 본문과 상태를 덮어쓰지 못함
   * - 기다리는 동안 실패한 저장이 옛 내용을 대기열에 되돌려 놓을 수 있어 끝난 뒤 한 번 더 비움
   */
  const settle = useCallback(async () => {
    window.clearTimeout(timerRef.current);
    window.clearTimeout(retryTimerRef.current);
    pendingRef.current = null;
    await inFlightRef.current;
    pendingRef.current = null;
    setSaveState('idle');
  }, []);

  const schedule = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      pendingRef.current = editor.getJSON();
      // 새로 입력하면 못 올린 이미지의 다시 시도 횟수를 비움 (이번 저장이 다시 올림)
      retryAttemptsRef.current = new Map();
      window.clearTimeout(retryTimerRef.current);
      setSaveState('pending');
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY);
    },
    [flush],
  );

  useEffect(() => {
    // 저장하지 않은 내용이 있으면 새로고침/탭 닫기 전에 확인
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRef.current || inFlightRef.current) {
        event.preventDefault();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.clearTimeout(retryTimerRef.current);

      // 못 올린 blob 이미지만 남아 대기 내용이 없어도 이 초안에 마지막으로 한 번 올려 저장
      // (이 시점에는 편집기가 아직 살아 있음: 초안을 바꾸면 이 정리 뒤에, 화면을 떠나면 다음 틱에 없어짐)
      const editor = editorRef.current;

      if (
        !pendingRef.current &&
        editor &&
        !editor.isDestroyed &&
        editor.isEditable &&
        collectBlobSrcs(editor.getJSON()).length > 0
      ) {
        pendingRef.current = editor.getJSON();
      }

      // 다른 초안으로 이동하면 남은 내용을 바로 저장
      void flush();
    };
  }, [flush]);

  return { saveState, schedule, settle, flush };
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
 * - 사이드바 목록 제목과 게시 상태도 서버 값으로 맞춤 (자동 저장·게시로 바꾼 값보다 우선)
 */
const useAppliedContent = (
  editor: Editor | null,
  draft: StudioDraft | null,
) => {
  const { setDraftTitle, setDraftPublishState } = useStudio();
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
    // 게시 중이던 초안은 결과 반영으로 '임시'가 되므로 화면에서 바꿔 둔 게시 상태도 서버 값으로 맞춤
    setDraftPublishState(draft.id, { status: draft.status, post: draft.post });
  }, [editor, draft, revision, setDraftTitle, setDraftPublishState]);
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
  // 이 초안의 AI 작업 (빈칸 채우기 중인 빈칸 잠금, 다듬기 막음)
  job: GenerationJobView | null;
  // 완료한 빈칸 채우기 결과 (그 빈칸에 넣음)
  fillResult: BlankFillResult | null;
  onFillStarted: (job: GenerationJobView) => void;
  // 빈칸 채우기 결과를 넣었음 (또는 빈칸이 없어 버림)
  onFillDone: (jobId: string) => void;
  // 작업 영역이 지금 본문을 읽는 데 쓰는 편집기 (다시 작성 확인)
  editorRef?: RefObject<Editor | null>;
}

// 커서가 화면 끝에 닿기 전에 스크롤할 간격 (px)
const CARET_SCROLL_MARGIN = 8;

/**
 * 초안 편집 영역: 상태와 내보내기/게시 버튼, 서식 툴바, Tiptap 편집기
 * - HTML / MD 버튼은 현재 내용을 파일로 내려받기
 * - 게시하기 / 다시 게시 / 게시 취소는 PublishActions
 */
const DraftEditor = ({
  repositoryId,
  draft,
  bottomInset,
  scrollAreaRef,
  isLocked,
  job,
  fillResult,
  onFillStarted,
  onFillDone,
  editorRef,
}: DraftEditorProps) => {
  const { t, i18n } = useLingui();
  const { draftPublishStates, draftStatuses } = useStudio();
  const images = usePendingImages(repositoryId);
  const { insertFiles, isAllowedSrc, uploadEditorImages, showNotice } = images;
  // 자동 저장이 끝날 때 / 빈칸의 AI 로 다듬기를 누를 때 부를 함수 (편집기 확장은 초안마다 한 번 만들어 ref 로 넘김)
  const savedHandlerRef = useRef<(() => void) | null>(null);
  const fillHandlerRef = useRef<((blankId: string) => void) | null>(null);
  const { saveState, schedule, settle, flush } = useDraftAutosave(
    repositoryId,
    draft?.id ?? null,
    images.prepareContent,
    savedHandlerRef,
  );
  const extensions = useMemo(
    () =>
      createEditorExtensions(
        {
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
            fill: t`AI 로 다듬기`,
            insert: t`그대로 넣기`,
            remove: t`지우기`,
            filling: t`AI 가 다듬는 중이에요`,
            tooLong: t`답은 1,000자까지 적을 수 있습니다`,
          },
          blankPlaceholder: t`여기에 직접 작성해 주세요`,
        },
        { onFiles: insertFiles, isAllowedSrc },
        { onFill: (blankId) => fillHandlerRef.current?.(blankId) },
      ),
    [t, insertFiles, isAllowedSrc],
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
          class: `${PROSE_CLASS} ${EDITOR_IMAGE_CLASS}`,
          'aria-label': t`초안 본문`,
        },
        // 입력 중인 줄이 아래쪽 기본 옵션 패널에 가려지지 않도록 위로 스크롤
        scrollMargin: scrollMarginRef.current,
        scrollThreshold: scrollMarginRef.current,
      },
      // id 가 없거나 겹치는 빈칸에 id 를 붙임 (편집할 수 있으면 자동 저장으로 남음)
      onCreate: ({ editor: created }) => {
        assignBlankIds(created);
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

  const { requestFill, handleSaved } = useBlankFill({
    editor,
    repositoryId,
    draftId: draft?.id ?? null,
    job,
    fillResult,
    saveNow: flush,
    onStarted: onFillStarted,
    onDone: onFillDone,
  });

  useEffect(() => {
    savedHandlerRef.current = handleSaved;
    fillHandlerRef.current = (blankId) => void requestFill(blankId);
  }, [handleSaved, requestFill]);

  useEffect(() => {
    if (!editorRef) {
      return;
    }

    editorRef.current = editor;

    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  // 게시·자동 저장으로 바뀐 상태가 서버에서 받은 값보다 우선
  const publishState = resolvePublishState(
    { status: draft?.status ?? 'draft', post: draft?.post ?? null },
    draft ? draftPublishStates[draft.id] : undefined,
    draft ? draftStatuses[draft.id] : undefined,
  );
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
  /**
   * 내보내기 전에 blob 이미지를 올려 공개 주소로 바꿈 (내보낸 파일에 blob: 주소가 남지 않도록)
   * - 올릴 이미지가 없으면 기다리지 않음 / 못 올린 이미지가 남으면 내보내지 않고 안내
   */
  const prepareExport = async (current: Editor) => {
    if (!draft || collectBlobSrcs(current.getJSON()).length === 0) {
      return true;
    }

    const isReady = await uploadEditorImages(current, draft.id, {
      emitUpdate: true,
    });

    if (!isReady) {
      showNotice('unuploaded');
    }

    return isReady;
  };
  const exportHtml = async () => {
    if (editor && confirmExport() && (await prepareExport(editor))) {
      downloadFile(toFileName(title, 'html'), editor.getHTML(), 'text/html');
    }
  };
  const exportMarkdown = async () => {
    if (editor && confirmExport() && (await prepareExport(editor))) {
      downloadFile(
        toFileName(title, 'md'),
        editor.getMarkdown(),
        'text/markdown',
      );
    }
  };
  // 게시 전 이미지 올리기 (게시가 현재 본문을 저장하므로 자동 저장은 다시 부르지 않음)
  const uploadImagesForPublish = async () =>
    !editor ||
    !draft ||
    uploadEditorImages(editor, draft.id, { emitUpdate: false });

  return (
    <section
      aria-label={t`초안 편집`}
      className="flex flex-1 flex-col pc:min-h-0"
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 pc:h-15 pc:px-3">
        <p className="flex min-w-0 items-center gap-1.5 text-[12px] leading-[normal] text-ink-faint">
          {i18n._(
            getDraftStatusLabel(
              publishState.status,
              publishState.post?.visibility ?? null,
            ),
          )}
          <span aria-live="polite" className="truncate">
            {emptyBlankCount > 0 && <Trans>· 빈칸 {emptyBlankCount}개</Trans>}
            {/* 빈칸 개수와 저장 상태가 함께 보이면 사이를 띄움 */}
            {emptyBlankCount > 0 &&
              (saveState === 'saving' || saveState === 'error') &&
              ' '}
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
            onClick={() => void exportHtml()}
            aria-label={t`HTML 파일로 내보내기`}
            className={`h-8 font-mono text-[12px] leading-[normal] font-medium pc:h-8.5 ${OUTLINE_BUTTON_CLASS}`}
          >
            HTML
          </button>
          <button
            type="button"
            disabled={!draft}
            onClick={() => void exportMarkdown()}
            aria-label={t`마크다운 파일로 내보내기`}
            className={`h-8 font-mono text-[12px] leading-[normal] font-medium pc:h-8.5 ${OUTLINE_BUTTON_CLASS}`}
          >
            MD
          </button>
          <PublishActions
            repositoryId={repositoryId}
            draft={draft}
            editor={editor}
            isLocked={isLocked}
            settle={settle}
            uploadImages={uploadImagesForPublish}
            onResave={schedule}
          />
        </div>
      </div>
      <EditorToolbar
        editor={editor}
        isDisabled={!draft || isLocked}
        onInsertImages={(files) => editor && insertFiles(editor, files)}
      />
      {/* 이미지 넣기·올리기 안내 (임시 디자인: 툴바 아래 한 줄, 잠시 뒤 사라짐) */}
      <div aria-live="polite" className="shrink-0">
        {images.notice && (
          <p className="border-b border-line bg-surface px-3 py-2 text-[12px] leading-[normal] text-danger pc:px-6">
            {i18n._(IMAGE_NOTICE_MESSAGES[images.notice])}
          </p>
        )}
      </div>
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
