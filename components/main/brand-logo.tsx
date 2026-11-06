interface BrandLogoProps {
  // light: 흰 배경(헤더), dark: 어두운 배경(푸터)
  tone?: 'light' | 'dark';
  // 모바일 크기 (헤더와 푸터의 서비스명 크기가 다름)
  placement?: 'header' | 'footer';
}

// comdraft 로고 (브랜드 기호 + 서비스명), 고유명사라 번역하지 않음
const BrandLogo = ({
  tone = 'light',
  placement = 'header',
}: BrandLogoProps) => {
  return (
    <span
      className={`flex items-center font-mono font-semibold leading-[normal] whitespace-nowrap pc:gap-2 ${
        placement === 'header' ? 'gap-1.5' : 'gap-2'
      }`}
    >
      <span
        aria-hidden="true"
        className="flex size-6.25 items-center justify-center bg-brand text-[15px] text-white pc:size-7.5 pc:text-[18px]"
      >
        {'>_'}
      </span>
      <span
        className={`tracking-[-1px] pc:text-[24px] ${
          placement === 'header' ? 'text-[18px]' : 'text-[19px]'
        } ${tone === 'light' ? 'text-ink' : 'text-white'}`}
      >
        comdraft
      </span>
    </span>
  );
};

export default BrandLogo;
