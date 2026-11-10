'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import type { Editor } from '@tiptap/react';
import LocalizedAnchor from '@/components/shared/localized-anchor';
import PublishDialog, {
  UnpublishDialog,
  type PublishFailure,
} from '@/components/studio/publish-dialog';
import {
  getPublishActions,
  resolvePublishState,
} from '@/components/studio/publish-state';
import { useStudio } from '@/components/studio/studio-context';
import {
  BRAND_BUTTON_CLASS,
  ICON_BUTTON_CLASS,
} from '@/components/studio/studio-styles';
import { useDropdown } from '@/hooks/use-dropdown';
import { useLocale } from '@/hooks/use-locale';
import { publishDraft, unpublishDraft } from '@/lib/actions/posts';
import type { PostVisibility } from '@/lib/db/schema';
import { checkPublishable } from '@/lib/posts/post-content';
import { getPostPath, parsePostPath } from '@/lib/posts/post-path';
import type { StudioDraft } from '@/lib/studio/queries';

const DEFAULT_VISIBILITY: PostVisibility = 'public';

// 서버 확인과 같은 검사를 현재 본문에 적용 (빈칸은 채웠든 아니든 모두 셈)
const inspectContent = (editor: Editor | null) => {
  try {
    const check = checkPublishable(editor?.getJSON() ?? {});

    return {
      blankCount: check.status === 'has_blanks' ? check.count : 0,
      hasNoTitle: check.status === 'no_title',
    };
  } catch {
    return { blankCount: 0, hasNoTitle: true };
  }
};

interface PublishActionsProps {
  repositoryId: string;
  // null 이면 새 초안 (게시할 수 없음)
  draft: StudioDraft | null;
  editor: Editor | null;
  // AI 작성 중이라 게시와 게시 취소 불가
  isLocked: boolean;
  // 게시 전에 진행 중인 자동 저장을 마무리 (게시가 현재 본문을 저장하므로 대기 중인 저장은 버림)
  settle: () => Promise<void>;
  // 게시하지 못했을 때 버려진 대기 저장을 다시 예약
  onResave: (editor: Editor) => void;
}

type OpenDialog = 'publish' | 'unpublish' | null;

/**
 * 편집기 상단의 게시 버튼 묶음
 * - 게시 전: 게시하기 / 게시 후: 다시 게시 + (글 보기, 게시 취소) 메뉴
 * - 게시와 다시 게시는 확인 창에서 공개 범위를 고른 뒤 진행
 */
const PublishActions = ({
  repositoryId,
  draft,
  editor,
  isLocked,
  settle,
  onResave,
}: PublishActionsProps) => {
  const { t } = useLingui();
  const locale = useLocale();
  const menuId = useId();
  const {
    repository,
    draftPublishStates,
    draftStatuses,
    setDraftPublishState,
  } = useStudio();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLAnchorElement>();
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [content, setContent] = useState({ blankCount: 0, hasNoTitle: false });
  const [failure, setFailure] = useState<PublishFailure | null>(null);
  const [hasUnpublishError, setHasUnpublishError] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const publishState = resolvePublishState(
    { status: draft?.status ?? 'draft', post: draft?.post ?? null },
    draft ? draftPublishStates[draft.id] : undefined,
    draft ? draftStatuses[draft.id] : undefined,
  );
  const { primary, canView, canUnpublish } = getPublishActions(publishState);
  const isDisabled = !draft || isLocked;
  const hasMenu = canView || canUnpublish;

  const closeDialog = () => {
    if (!isPending) {
      setOpenDialog(null);
    }
  };

  const openPublishDialog = () => {
    setContent(inspectContent(editor));
    setFailure(null);
    setOpenDialog('publish');
  };

  const handlePublish = async (visibility: PostVisibility) => {
    if (!draft || !editor || isPending) {
      return;
    }

    setIsPending(true);
    setFailure(null);

    try {
      // 진행 중인 자동 저장이 끝난 뒤에 게시 (옛 본문 저장이 게시를 덮어쓰지 않도록)
      await settle();

      const result = await publishDraft(
        repositoryId,
        draft.id,
        JSON.stringify(editor.getJSON()),
        visibility,
        locale,
      );

      if (result.status === 'published') {
        const post = parsePostPath(result.path.replace(/^\/posts\//, ''));

        if (post) {
          setDraftPublishState(draft.id, {
            status: 'published',
            post: { ...post, visibility: result.visibility },
          });
          setOpenDialog(null);
          return;
        }

        setFailure('error');
        return;
      }

      // 게시하지 못해도 방금 settle 이 버린 저장 대기분을 되살림
      onResave(editor);

      if (result.status === 'has_blanks') {
        setContent({ blankCount: result.count, hasNoTitle: false });
        return;
      }

      setFailure(result.status);
    } catch {
      onResave(editor);
      setFailure('error');
    } finally {
      setIsPending(false);
    }
  };

  const handleUnpublish = async () => {
    if (!draft || isPending) {
      return;
    }

    setIsPending(true);
    setHasUnpublishError(false);

    try {
      const result = await unpublishDraft(repositoryId, draft.id);

      if (result.status === 'unpublished') {
        setDraftPublishState(draft.id, { status: 'draft', post: null });
        setOpenDialog(null);
        return;
      }

      setHasUnpublishError(true);
    } catch {
      setHasUnpublishError(true);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={isDisabled}
        onClick={openPublishDialog}
        className={`h-8 pc:h-8.5 ${BRAND_BUTTON_CLASS}`}
      >
        {primary === 'republish' ? (
          <Trans>다시 게시</Trans>
        ) : (
          <Trans>게시하기</Trans>
        )}
      </button>
      {hasMenu && (
        <div ref={containerRef} onBlur={handleBlur} className="relative">
          <button
            ref={triggerRef}
            type="button"
            disabled={isDisabled}
            aria-label={t`게시 메뉴`}
            aria-expanded={isOpen}
            aria-controls={menuId}
            onClick={toggle}
            className={`size-8 pc:size-8.5 ${ICON_BUTTON_CLASS} ${isOpen ? 'bg-line/60' : 'hover:bg-line/60'}`}
          >
            <Image
              src="/images/studio/ellipsis.svg"
              alt=""
              width={17}
              height={17}
            />
          </button>
          {isOpen && (
            <div
              id={menuId}
              className="absolute top-[calc(100%+8px)] right-0 z-20 w-33 rounded border border-line bg-white"
            >
              {canView && publishState.post && (
                <LocalizedAnchor
                  ref={firstItemRef}
                  href={getPostPath(publishState.post)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={toggle}
                  className="flex h-11 w-full items-center gap-2.5 rounded px-3.5 text-left text-[13px] leading-[normal] text-ink outline-none hover:bg-surface focus:bg-surface"
                >
                  <Image
                    src="/images/studio/external-link.svg"
                    alt=""
                    width={16}
                    height={16}
                  />
                  <Trans>글 보기</Trans>
                </LocalizedAnchor>
              )}
              {canUnpublish && (
                <button
                  type="button"
                  onClick={() => {
                    toggle();
                    setHasUnpublishError(false);
                    setOpenDialog('unpublish');
                  }}
                  className="flex h-11 w-full items-center gap-2.5 rounded px-3.5 text-left text-[13px] leading-[normal] text-danger outline-none hover:bg-surface focus:bg-surface"
                >
                  <Image
                    src="/images/studio/eye-off.svg"
                    alt=""
                    width={16}
                    height={16}
                  />
                  <Trans>게시 취소</Trans>
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {openDialog === 'publish' && (
        <PublishDialog
          isRepublish={primary === 'republish'}
          initialVisibility={
            publishState.post?.visibility ?? DEFAULT_VISIBILITY
          }
          isPrivateRepository={repository.isPrivate}
          blankCount={content.blankCount}
          hasNoTitle={content.hasNoTitle}
          failure={failure}
          isPending={isPending}
          onSubmit={(visibility) => void handlePublish(visibility)}
          onClose={closeDialog}
        />
      )}
      {openDialog === 'unpublish' && (
        <UnpublishDialog
          isPending={isPending}
          hasError={hasUnpublishError}
          onConfirm={() => void handleUnpublish()}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

export default PublishActions;
