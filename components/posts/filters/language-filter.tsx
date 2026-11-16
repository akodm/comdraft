import { Trans, useLingui } from '@lingui/react/macro';
import PostFilterGroup from '@/components/posts/filters/post-filter-group';
import LocalizedLink from '@/components/shared/localized-link';
import { LOCALE_LABELS, LOCALES, type Locale } from '@/lib/i18n/config';
import { getPostListHref, type PostListFilters } from '@/lib/posts/post-list';

interface LanguageFilterProps {
  filters: PostListFilters;
}

interface LanguageOptionProps {
  href: string;
  isSelected: boolean;
  children: string;
}

const LanguageOption = ({
  href,
  isSelected,
  children,
}: LanguageOptionProps) => (
  <li>
    <LocalizedLink
      href={href}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex h-10 items-center gap-2.5 rounded px-2 text-[15px] leading-[1.2] ${
        isSelected
          ? 'font-medium text-ink'
          : 'text-ink-muted hover:bg-surface hover:text-ink'
      }`}
    >
      {/* 라디오 모양 표시 (선택 상태는 aria-current 로 전달) */}
      <span
        aria-hidden="true"
        className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border ${
          isSelected ? 'border-brand' : 'border-ink-subtle'
        }`}
      >
        {isSelected && <span className="size-2.5 rounded-full bg-brand" />}
      </span>
      {children}
    </LocalizedLink>
  </li>
);

/**
 * 게시글 언어 필터 (전체 + 서비스가 제공하는 언어)
 * - 화면 언어와 별개로 게시할 때의 언어(post.locale)로 거름
 * - 고르면 다른 필터는 유지한 채 1쪽으로 이동
 * - 언어 이름은 번역하지 않고 각 언어의 자기 이름으로 표시
 */
const LanguageFilter = ({ filters }: LanguageFilterProps) => {
  const { t } = useLingui();
  const hrefFor = (language: Locale | null) =>
    getPostListHref(1, { ...filters, language });

  return (
    <PostFilterGroup legend={<Trans>언어</Trans>}>
      <ul aria-label={t`게시글 언어`} className="flex flex-col gap-0.5">
        <LanguageOption
          href={hrefFor(null)}
          isSelected={filters.language === null}
        >
          {t`전체`}
        </LanguageOption>
        {LOCALES.map((locale) => (
          <LanguageOption
            key={locale}
            href={hrefFor(locale)}
            isSelected={filters.language === locale}
          >
            {LOCALE_LABELS[locale]}
          </LanguageOption>
        ))}
      </ul>
    </PostFilterGroup>
  );
};

export default LanguageFilter;
