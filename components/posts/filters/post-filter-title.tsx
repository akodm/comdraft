import Image from 'next/image';
import { Trans } from '@lingui/react/macro';

interface PostFilterTitleProps {
  // 모바일 사이드바가 dialog 이름으로 연결할 id
  id?: string;
}

/** 필터 영역 제목 (PC 패널과 모바일 사이드바 공통) */
const PostFilterTitle = ({ id }: PostFilterTitleProps) => {
  return (
    <h2
      id={id}
      className="flex items-center gap-2 text-[16px] leading-[1.2] font-bold text-ink"
    >
      <Image
        src="/images/posts/sliders-horizontal.svg"
        alt=""
        width={18}
        height={18}
      />
      <Trans>필터</Trans>
    </h2>
  );
};

export default PostFilterTitle;
