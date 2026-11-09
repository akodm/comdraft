'use client';

import Image from 'next/image';

interface RepositoryBadgeProps {
  iconSrc: string;
  label: string;
}

/**
 * 저장소 카드 상단의 상태 아이콘 (공개 범위, 소유 계정 종류)
 * - 마우스를 올리거나 키보드로 포커스하면 툴팁 표시, Escape 로 포커스를 빼서 닫음
 * - 스크린 리더는 버튼 이름(aria-label)으로 읽으므로 화면용 툴팁은 중복 낭독되지 않게 숨김
 */
const RepositoryBadge = ({ iconSrc, label }: RepositoryBadgeProps) => {
  return (
    <button
      type="button"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.blur();
        }
      }}
      className="group relative flex size-3 cursor-default items-center justify-center rounded-xs outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
    >
      <Image src={iconSrc} alt="" width={12} height={12} />
      <span
        aria-hidden="true"
        className="pointer-events-none invisible absolute -right-1.5 bottom-[calc(100%+8px)] z-10 rounded bg-ink px-2 py-1 text-[12px] leading-[1.4] font-medium whitespace-nowrap text-white opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
};

export default RepositoryBadge;
