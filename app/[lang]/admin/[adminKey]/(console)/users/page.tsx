import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
  ADMIN_INPUT_CLASS,
  ADMIN_TITLE_CLASS,
} from '@/components/admin/admin-styles';
import AdminPagination from '@/components/admin/admin-pagination';
import AdminTable from '@/components/admin/admin-table';
import LocalizedLink from '@/components/shared/localized-link';
import { BRAND_BUTTON_CLASS } from '@/components/studio/studio-styles';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { ADMIN_PAGE_SIZE } from '@/lib/admin/pagination';
import { adminPath } from '@/lib/admin/path-key';
import { listUsers } from '@/lib/admin/user-queries';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { parsePageParam } from '@/lib/posts/post-list';

interface AdminUsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// 검색어 (여러 번 들어오면 첫 값만, 너무 긴 값은 자름)
const readQuery = (value: string | string[] | undefined): string => {
  const first = Array.isArray(value) ? value[0] : value;

  return (first ?? '').trim().slice(0, 100);
};

// 이번 주 사용률 (한도 대비 %, 100 을 넘을 수 있음)
const formatUsage = (used: number, limit: number): string =>
  limit > 0 ? `${Math.round((used / limit) * 100)}%` : '-';

const formatDate = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
  }).format(date);

// 어드민 사용자 목록: 이메일·GitHub 아이디로 검색, 50개씩
export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  const i18n = await initLingui();
  await requireAdmin('view');

  const params = await searchParams;
  const q = readQuery(params.q);
  const page = parsePageParam(params.page);
  const locale = await getLocale();
  const basePath = adminPath(locale, requireAdminKey(), 'users');
  const { rows, total } = await listUsers({ q, page });

  return (
    <div className="flex flex-col gap-6">
      <h1 className={ADMIN_TITLE_CLASS}>
        <Trans>사용자</Trans>
      </h1>

      <form method="get" action={basePath} className="flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={100}
          aria-label={i18n._(msg`이메일 또는 GitHub 아이디 검색`)}
          placeholder={i18n._(msg`이메일 또는 GitHub 아이디`)}
          className={ADMIN_INPUT_CLASS}
        />
        <button type="submit" className={`h-10 shrink-0 ${BRAND_BUTTON_CLASS}`}>
          <Trans>검색</Trans>
        </button>
      </form>

      <AdminTable
        columns={[
          { key: 'email', label: <Trans>이메일</Trans> },
          { key: 'github', label: <Trans>GitHub</Trans> },
          { key: 'role', label: <Trans>등급</Trans> },
          {
            key: 'usage',
            label: <Trans>이번 주 사용률</Trans>,
            className: 'text-right',
          },
          { key: 'status', label: <Trans>상태</Trans> },
          { key: 'createdAt', label: <Trans>가입일</Trans> },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            email: (
              <LocalizedLink
                href={`${basePath}/${row.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {row.email}
              </LocalizedLink>
            ),
            github: row.githubLogin ?? '-',
            role: row.role,
            usage: row.quota
              ? formatUsage(row.quota.used, row.quota.limit)
              : '-',
            status: row.bannedAt ? (
              <span className="border border-danger px-1.5 py-0.5 text-[11px] text-danger">
                <Trans>밴</Trans>
              </span>
            ) : (
              '-'
            ),
            createdAt: formatDate(row.createdAt, locale),
          },
        }))}
        empty={<Trans>조건에 맞는 사용자가 없어요</Trans>}
      />

      <AdminPagination
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
        basePath={basePath}
        query={{ q }}
      />
    </div>
  );
}
