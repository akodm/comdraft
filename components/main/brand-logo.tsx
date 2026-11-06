// 모바일 간격과 서비스명 크기 (PC 는 위치와 관계없이 같음)
const PLACEMENT_CLASS = {
  header: { gap: 'gap-1.5', name: 'text-[18px]' },
  footer: { gap: 'gap-2', name: 'text-[19px]' },
  auth: { gap: 'gap-2', name: 'text-[20px]' },
};

interface BrandLogoProps {
  // light: 흰 배경(헤더), dark: 어두운 배경(푸터)
  tone?: 'light' | 'dark';
  placement?: keyof typeof PLACEMENT_CLASS;
}

// comdraft 로고 (브랜드 기호 + 서비스명), 고유명사라 번역하지 않음
const BrandLogo = ({
  tone = 'light',
  placement = 'header',
}: BrandLogoProps) => {
  const { gap, name } = PLACEMENT_CLASS[placement];

  return (
    <span
      className={`flex items-center font-mono font-semibold leading-[normal] whitespace-nowrap pc:gap-2 ${gap}`}
    >
      <span
        aria-hidden="true"
        className="flex size-6.25 items-center justify-center bg-brand text-[15px] text-white pc:size-7.5 pc:text-[18px]"
      >
        {'>_'}
      </span>
      <span
        className={`tracking-[-1px] pc:text-[24px] ${name} ${
          tone === 'light' ? 'text-ink' : 'text-white'
        }`}
      >
        comdraft
      </span>
    </span>
  );
};

export default BrandLogo;
