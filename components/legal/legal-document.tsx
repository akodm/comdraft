import { Trans, useLingui } from '@lingui/react/macro';
import { formatDate } from '@/lib/dashboard/format';
import type { Locale } from '@/lib/i18n/config';
import type { LegalDocument } from '@/lib/legal/types';
import { CONTACT_EMAIL, getContactMailto } from '@/lib/site/contact';

interface LegalDocumentViewProps {
  document: LegalDocument;
  locale: Locale;
}

/**
 * 개인정보처리방침·이용약관 본문 (제목 H1, 시행일, 조항별 H2·문단·목록)
 * - 문의처 조항에는 운영자 이메일을 메일 앱 링크로 붙임
 */
const LegalDocumentView = ({ document, locale }: LegalDocumentViewProps) => {
  const { t } = useLingui();
  // 시행일은 한국 시간 기준 날짜
  const effectiveDate = new Date(`${document.effectiveDate}T00:00:00+09:00`);

  return (
    <article className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16 pc:px-0 pc:pt-16 pc:pb-24">
      <h1 className="text-[26px] leading-[1.35] font-bold tracking-[-0.5px] break-keep text-ink pc:text-[34px]">
        {document.title}
      </h1>
      <p className="mt-3 text-[13px] leading-[normal] text-ink-faint pc:text-[14px]">
        <Trans>시행일</Trans>{' '}
        <time dateTime={document.effectiveDate}>
          {formatDate(effectiveDate, locale)}
        </time>
      </p>
      <p className="mt-8 text-[15px] leading-[1.85] break-keep text-ink-muted pc:text-[16px]">
        {document.intro}
      </p>
      {document.sections.map((section) => (
        <section key={section.heading} className="mt-10">
          <h2 className="text-[18px] leading-[1.4] font-bold break-keep text-ink pc:text-[20px]">
            {section.heading}
          </h2>
          {section.paragraphs?.map((paragraph) => (
            <p
              key={paragraph}
              className="mt-3 text-[15px] leading-[1.85] break-keep text-ink-muted"
            >
              {paragraph}
            </p>
          ))}
          {section.items && (
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-[1.8] break-keep text-ink-muted marker:text-ink-faint">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {section.contact && (
            <p className="mt-3 text-[15px] leading-[1.85] text-ink-muted">
              <Trans>이메일</Trans>:{' '}
              <a
                href={getContactMailto(t`[comdraft] 문의`)}
                className="font-mono text-brand hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          )}
        </section>
      ))}
    </article>
  );
};

export default LegalDocumentView;
