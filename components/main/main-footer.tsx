import { Trans, useLingui } from '@lingui/react/macro';
import BrandLogo from '@/components/main/brand-logo';
import LocalizedLink from '@/components/shared/localized-link';
import { CONTACT_EMAIL, getContactMailto } from '@/lib/site/contact';

const FOOTER_LINK_CLASS = 'hover:underline';

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
 * - 개인정보처리방침·이용약관 페이지 링크, 문의하기와 개발자 이메일은 메일 앱으로 연결
 */
const MainFooter = ({ width = 'default' }: MainFooterProps) => {
  const { t } = useLingui();
  const contactHref = getContactMailto(t`[comdraft] 문의`);

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
                <LocalizedLink href="/privacy" className={FOOTER_LINK_CLASS}>
                  <Trans>개인정보처리방침</Trans>
                </LocalizedLink>
              </li>
              <li>
                <LocalizedLink href="/terms" className={FOOTER_LINK_CLASS}>
                  <Trans>이용약관</Trans>
                </LocalizedLink>
              </li>
              <li>
                <a href={contactHref} className={FOOTER_LINK_CLASS}>
                  <Trans>문의하기</Trans>
                </a>
              </li>
            </ul>
          </nav>
          <div className="flex flex-col gap-2 whitespace-nowrap">
            <p className="text-[12px] leading-[1.2] text-ink-subtle">
              <Trans>개발자 이메일</Trans>
            </p>
            <a
              href={contactHref}
              className={`font-mono text-[12px] leading-[normal] text-white pc:text-[14px] ${FOOTER_LINK_CLASS}`}
            >
              {CONTACT_EMAIL}
            </a>
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
