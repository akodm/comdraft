import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import LocalizedLink from '@/components/shared/localized-link';
import { getPaginationItems, getPostListHref } from '@/lib/posts/post-list';

interface PostPaginationProps {
  currentPage: number;
  totalPages: number;
}

const CELL_CLASS =
  'flex size-9 items-center justify-center rounded text-[14px] leading-[normal]';

// 현재 쪽 주변에 보여 줄 번호 수 (PC 앞뒤 2개, 모바일 앞뒤 1개)
const PC_SIBLINGS = 2;
const MOBILE_SIBLINGS = 1;

const ArrowIcon = ({ direction }: { direction: 'left' | 'right' }) => (
  <Image
    src={`/images/posts/chevron-${direction}.svg`}
    alt=""
    width={20}
    height={20}
  />
);

const PageNumbers = ({
  currentPage,
  totalPages,
  siblings,
  className,
}: PostPaginationProps & { siblings: number; className: string }) => {
  const { t } = useLingui();
  const items = getPaginationItems(currentPage, totalPages, siblings);

  return (
    <ol className={className}>
      {items.map((item, index) =>
        item === 'gap' ? (
          <li
            // 같은 목록에 gap 이 두 번 나올 수 있어 위치로 구분
            key={`gap-${index}`}
            aria-hidden="true"
            className={`${CELL_CLASS} text-ink-subtle`}
          >
            …
          </li>
        ) : (
          <li key={item}>
            <LocalizedLink
              href={getPostListHref(item)}
              aria-label={t`${item}쪽`}
              aria-current={item === currentPage ? 'page' : undefined}
              className={`${CELL_CLASS} ${
                item === currentPage
                  ? 'bg-ink font-bold text-white'
                  : 'text-ink-muted hover:bg-surface'
              }`}
            >
              {item}
            </LocalizedLink>
          </li>
        ),
      )}
    </ol>
  );
};

/**
 * 게시글 목록 번호 페이지네이션 (1쪽뿐이면 보여주지 않음)
 * - 이전·다음 화살표와 첫·마지막 쪽, 현재 쪽 주변 번호 (사이는 …)
 * - PC 는 현재 쪽 앞뒤 2개, 모바일은 1개 (두 벌을 그리고 폭에 따라 전환)
 */
const PostPagination = ({ currentPage, totalPages }: PostPaginationProps) => {
  const { t } = useLingui();

  if (totalPages <= 1) {
    return null;
  }

  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav
      aria-label={t`페이지 이동`}
      className="flex items-center justify-center gap-1"
    >
      {hasPrevious ? (
        <LocalizedLink
          href={getPostListHref(currentPage - 1)}
          aria-label={t`이전 쪽`}
          className={`${CELL_CLASS} hover:bg-surface`}
        >
          <ArrowIcon direction="left" />
        </LocalizedLink>
      ) : (
        <span aria-hidden="true" className={`${CELL_CLASS} opacity-35`}>
          <ArrowIcon direction="left" />
        </span>
      )}
      <PageNumbers
        currentPage={currentPage}
        totalPages={totalPages}
        siblings={PC_SIBLINGS}
        className="hidden items-center gap-1 pc:flex"
      />
      <PageNumbers
        currentPage={currentPage}
        totalPages={totalPages}
        siblings={MOBILE_SIBLINGS}
        className="flex items-center gap-1 pc:hidden"
      />
      {hasNext ? (
        <LocalizedLink
          href={getPostListHref(currentPage + 1)}
          aria-label={t`다음 쪽`}
          className={`${CELL_CLASS} hover:bg-surface`}
        >
          <ArrowIcon direction="right" />
        </LocalizedLink>
      ) : (
        <span aria-hidden="true" className={`${CELL_CLASS} opacity-35`}>
          <ArrowIcon direction="right" />
        </span>
      )}
      <span className="sr-only">
        <Trans>
          전체 {totalPages}쪽 중 {currentPage}쪽
        </Trans>
      </span>
    </nav>
  );
};

export default PostPagination;
