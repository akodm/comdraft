import { Trans } from '@lingui/react/macro';
import LocalizedLink from '@/components/shared/localized-link';

const VARIANT_CLASS = {
  // 목록 위 오른쪽의 보조 버튼
  secondary: 'h-10 border border-line bg-surface px-4 text-ink',
  // 빈 상태 가운데의 주요 버튼
  primary: 'h-11 bg-brand px-6 text-white',
};

interface AddRepositoryLinkProps {
  variant: keyof typeof VARIANT_CLASS;
}

// 저장소 추가 화면으로 이동하는 "추가+" 버튼
const AddRepositoryLink = ({ variant }: AddRepositoryLinkProps) => {
  return (
    <LocalizedLink
      href="/dashboard/repositories"
      className={`flex items-center justify-center rounded-md text-[14px] leading-[normal] font-medium whitespace-nowrap ${VARIANT_CLASS[variant]}`}
    >
      <Trans>추가+</Trans>
    </LocalizedLink>
  );
};

export default AddRepositoryLink;
