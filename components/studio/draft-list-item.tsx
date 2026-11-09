'use client';

import { useId } from 'react';
import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import LocalizedLink from '@/components/shared/localized-link';
import { getDraftStatusLabel } from '@/components/studio/draft-status';
import { ICON_BUTTON_CLASS } from '@/components/studio/studio-styles';
import { useDropdown } from '@/hooks/use-dropdown';
import type { StudioDraftSummary } from '@/lib/studio/queries';

interface DraftItemMenuProps {
  title: string;
  onDelete: () => void;
}

/**
 * 초안 항목의 더보기 메뉴 (삭제)
 * - PC 는 항목에 마우스를 올리거나 키보드 포커스가 있을 때, 모바일은 항상 버튼이 보임
 * - 확인 단계 없이 바로 삭제 (확인 디자인이 아직 없음)
 */
const DraftItemMenu = ({ title, onDelete }: DraftItemMenuProps) => {
  const { t } = useLingui();
  const menuId = useId();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLButtonElement>();
  const label = title || t`제목 없는 초안`;

  const handleDelete = () => {
    toggle();
    onDelete();
  };

  return (
    <div
      ref={containerRef}
      onBlur={handleBlur}
      className={`absolute top-3.5 right-3 pc:group-focus-within:opacity-100 pc:group-hover:opacity-100 ${
        isOpen ? '' : 'pc:opacity-0'
      }`}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={t`${label} 메뉴`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
        className={`size-6 ${ICON_BUTTON_CLASS} ${isOpen ? 'bg-line/60' : 'hover:bg-line/60'}`}
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
          className="absolute top-[calc(100%+8px)] right-1 z-20 w-33 rounded border border-line bg-white"
        >
          <button
            ref={firstItemRef}
            type="button"
            onClick={handleDelete}
            className="flex h-11 w-full items-center gap-2.5 rounded px-3.5 text-left text-[13px] leading-[normal] text-danger outline-none hover:bg-surface focus:bg-surface"
          >
            <Image
              src="/images/studio/trash-2.svg"
              alt=""
              width={16}
              height={16}
            />
            <Trans>삭제</Trans>
          </button>
        </div>
      )}
    </div>
  );
};

interface DraftListItemProps {
  draft: StudioDraftSummary;
  title: string;
  href: string;
  isActive: boolean;
  onDelete: () => void;
}

// 초안 목록 한 항목: 제목/상태 링크 + 더보기 메뉴 (링크 안에 버튼을 둘 수 없어 겹쳐 배치)
const DraftListItem = ({
  draft,
  title,
  href,
  isActive,
  onDelete,
}: DraftListItemProps) => {
  const { i18n } = useLingui();

  return (
    <li className="group relative shrink-0">
      <LocalizedLink
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={`flex min-h-20.5 flex-col gap-1.75 rounded-[3px] border py-3.5 pr-11 pl-3 ${
          isActive
            ? 'border-line bg-surface pc:border-transparent'
            : 'border-transparent group-focus-within:bg-surface group-hover:bg-surface'
        }`}
      >
        <span
          className={`line-clamp-2 text-[13px] leading-[1.65] wrap-anywhere ${
            title ? 'text-ink' : 'text-ink-faint'
          } ${isActive ? 'font-bold' : ''}`}
        >
          {title || <Trans>제목 없는 초안</Trans>}
        </span>
        <span className="text-[11px] leading-[1.5] text-ink-faint">
          {i18n._(getDraftStatusLabel(draft.status, draft.visibility))}
        </span>
      </LocalizedLink>
      <DraftItemMenu title={title} onDelete={onDelete} />
    </li>
  );
};

export default DraftListItem;
