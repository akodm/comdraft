import { Trans, useLingui } from '@lingui/react/macro';
import BrandLogo from '@/components/main/brand-logo';

// 개발자 연락처는 디자인의 예시 주소 (실제 주소가 정해지면 교체)
const DEVELOPER_EMAIL = 'developer@example.com';

// PC 콘텐츠 최대 폭 (wide: 회원가입/로그인처럼 좌우로 나뉜 화면)
const WIDTH_CLASS = {
  default: 'pc:max-w-7xl',
  wide: 'pc:max-w-360',
};

interface MainFooterProps {
  width?: keyof typeof WIDTH_CLASS;
}

/**
 * 메인 푸터
 * - 약관/문의 페이지가 아직 없어 메뉴는 텍스트로만 표시
 */
const MainFooter = ({ width = 'default' }: MainFooterProps) => {
  const { t } = useLingui();

  return (
    <footer className="bg-ink px-5 py-10 pc:py-14">
      <div
        className={`flex flex-col gap-7 pc:mx-auto pc:gap-10 ${WIDTH_CLASS[width]}`}
      >
        <div className="flex flex-col gap-7 pc:flex-row pc:items-start pc:justify-between">
          <BrandLogo tone="dark" placement="footer" />
          <nav aria-label={t`푸터 메뉴`}>
            <ul className="flex flex-wrap gap-4.5 text-[12px] leading-[1.2] whitespace-nowrap text-white pc:gap-8 pc:text-[14px]">
              <li>
                <Trans>개인정보처리방침</Trans>
              </li>
              <li>
                <Trans>이용약관</Trans>
              </li>
              <li>
                <Trans>문의하기</Trans>
              </li>
            </ul>
          </nav>
          <div className="flex flex-col gap-2 whitespace-nowrap">
            <p className="text-[12px] leading-[1.2] text-ink-subtle">
              <Trans>개발자 이메일 · 예시 주소</Trans>
            </p>
            <p className="font-mono text-[12px] leading-[normal] text-white pc:text-[14px]">
              {DEVELOPER_EMAIL}
            </p>
          </div>
        </div>
        <p className="font-mono text-[11px] leading-[normal] whitespace-nowrap text-ink-subtle">
          <Trans>© 2026 comdraft. All rights reserved.</Trans>
        </p>
      </div>
    </footer>
  );
};

export default MainFooter;
