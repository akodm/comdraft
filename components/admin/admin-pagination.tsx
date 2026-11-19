import { Trans, useLingui } from '@lingui/react/macro';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import LocalizedLink from '@/components/shared/localized-link';
import { buildAdminPageHref, getAdminTotalPages } from '@/lib/admin/pagination';
import { getPaginationItems } from '@/lib/posts/post-list';

interface AdminPaginationProps {
  page: number;
  pageSize: 50;
  total: number;
  // 로케일과 주소 키가 붙은 목록 주소 (adminPath 결과)
  basePath: string;
  // 쪽을 옮겨도 유지할 쿼리 (검색어 등)
  query: Record<string, string>;
}

const CELL_CLASS =
  'flex size-8 shrink-0 items-center justify-center text-[13px] leading-[normal]';

// 현재 쪽 앞뒤로 보여 줄 번호 수
const SIBLINGS = 2;

/**
 * 어드민 목록 쪽 번호 (전체 건수와 함께, 1쪽뿐이면 번호는 숨김)
 * - 이전·다음 화살표와 첫·마지막 쪽, 현재 쪽 주변 번호 (사이는 …)
 */
const AdminPagination = ({
  page,
  pageSize,
  total,
  basePath,
  query,
}: AdminPaginationProps) => {
  const { t } = useLingui();
  const totalPages = getAdminTotalPages(total, pageSize);
  const items = getPaginationItems(page, totalPages, SIBLINGS);
  const hrefFor = (target: number) =>
    buildAdminPageHref(basePath, query, target);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-[12px] leading-[normal] text-ink-faint">
        <Trans>전체 {total}건</Trans>
      </p>
      {totalPages > 1 && (
        <nav aria-label={t`페이지 이동`} className="flex items-center gap-1">
          {page > 1 ? (
            <LocalizedLink
              href={hrefFor(page - 1)}
              aria-label={t`이전 쪽`}
              className={`${CELL_CLASS} text-ink-muted hover:bg-surface`}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </LocalizedLink>
          ) : (
            <span
              aria-hidden="true"
              className={`${CELL_CLASS} text-ink-subtle`}
            >
              <ChevronLeft className="size-4" />
            </span>
          )}
          <ol className="flex items-center gap-1">
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
                    href={hrefFor(item)}
                    aria-label={t`${item}쪽`}
                    aria-current={item === page ? 'page' : undefined}
                    className={`${CELL_CLASS} ${
                      item === page
                        ? 'bg-ink font-semibold text-white'
                        : 'text-ink-muted hover:bg-surface'
                    }`}
                  >
                    {item}
                  </LocalizedLink>
                </li>
              ),
            )}
          </ol>
          {page < totalPages ? (
            <LocalizedLink
              href={hrefFor(page + 1)}
              aria-label={t`다음 쪽`}
              className={`${CELL_CLASS} text-ink-muted hover:bg-surface`}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </LocalizedLink>
          ) : (
            <span
              aria-hidden="true"
              className={`${CELL_CLASS} text-ink-subtle`}
            >
              <ChevronRight className="size-4" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
};

export default AdminPagination;
