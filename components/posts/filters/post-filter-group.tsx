import type { ReactNode } from 'react';

interface PostFilterGroupProps {
  // 그룹 이름 (fieldset legend 로 보여 주고 보조기기에도 그룹 이름으로 읽힘)
  legend: ReactNode;
  children: ReactNode;
}

/**
 * 필터 섹션 안의 필터 하나 (언어, 나중에 검색·태그 등)
 * - 그룹마다 이름과 선택지를 같은 모양으로 묶음
 */
const PostFilterGroup = ({ legend, children }: PostFilterGroupProps) => {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-[13px] leading-[1.2] font-medium text-ink-faint">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
};

export default PostFilterGroup;
