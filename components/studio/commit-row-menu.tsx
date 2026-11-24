'use client';

import { useEffect, useId } from 'react';
import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import { ICON_BUTTON_CLASS } from '@/components/studio/studio-styles';
import type { AutoDraftCommitAction } from '@/hooks/use-auto-draft-state';
import { useDropdown } from '@/hooks/use-dropdown';

const MENU_ITEM_CLASS =
  'flex h-10 w-full items-center gap-2.5 rounded px-3 text-left text-[13px] leading-[normal] text-ink-muted outline-none hover:bg-surface hover:text-ink focus:bg-surface focus:text-ink disabled:opacity-40 disabled:hover:bg-transparent';

interface CommitRowMenuProps {
  shortSha: string;
  isExcluded: boolean;
  isPending: boolean;
  onAction: (action: AutoDraftCommitAction) => void;
}

/**
 * 커밋 줄의 더보기 메뉴 (여기를 기준점으로, 제외 / 제외 취소)
 * - 자동 대상이 될 수 있는 커밋에만 붙임 (수집 안 됨 커밋은 줄에서 메뉴를 그리지 않음)
 * - 동작이 진행되는 동안 항목을 비활성화하고, 누르면 메뉴를 닫음
 */
const CommitRowMenu = ({
  shortSha,
  isExcluded,
  isPending,
  onAction,
}: CommitRowMenuProps) => {
  const { t } = useLingui();
  const menuId = useId();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLButtonElement>();

  // 목록 아래쪽 줄에서 열어도 스크롤 영역에 잘리지 않게 보이는 곳까지 스크롤
  useEffect(() => {
    if (isOpen) {
      document
        .getElementById(menuId)
        ?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [isOpen, menuId]);

  const run = (action: AutoDraftCommitAction) => {
    triggerRef.current?.focus();
    toggle();
    onAction(action);
  };

  return (
    <div ref={containerRef} onBlur={handleBlur} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t`커밋 ${shortSha} 메뉴`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
        className={`size-6 ${ICON_BUTTON_CLASS} ${isOpen ? 'bg-line/60' : ''}`}
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
          className="absolute top-[calc(100%+4px)] right-0 z-20 w-44 rounded border border-line bg-white p-1 shadow-md"
        >
          <button
            ref={firstItemRef}
            type="button"
            disabled={isPending}
            onClick={() => run('anchor')}
            className={MENU_ITEM_CLASS}
          >
            <Image
              src="/images/studio/flag.svg"
              alt=""
              width={16}
              height={16}
            />
            <Trans>여기를 기준점으로</Trans>
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(isExcluded ? 'restore' : 'exclude')}
            className={MENU_ITEM_CLASS}
          >
            <Image
              src={
                isExcluded
                  ? '/images/studio/undo-2.svg'
                  : '/images/studio/circle-slash.svg'
              }
              alt=""
              width={16}
              height={16}
            />
            {isExcluded ? <Trans>제외 취소</Trans> : <Trans>제외</Trans>}
          </button>
        </div>
      )}
    </div>
  );
};

export default CommitRowMenu;
