import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
  ADMIN_INPUT_CLASS,
  ADMIN_SELECT_CLASS,
  ADMIN_TITLE_CLASS,
} from '@/components/admin/admin-styles';
import AdminPagination from '@/components/admin/admin-pagination';
import AdminTable from '@/components/admin/admin-table';
import LocalizedLink from '@/components/shared/localized-link';
import { BRAND_BUTTON_CLASS } from '@/components/studio/studio-styles';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { ADMIN_PAGE_SIZE } from '@/lib/admin/pagination';
import { adminPath } from '@/lib/admin/path-key';
import {
  listPosts,
  parsePostLocale,
  parseVisibility,
} from '@/lib/admin/post-queries';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { parsePageParam } from '@/lib/posts/post-list';

interface AdminPostsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// 쿼리 값 (여러 번 들어오면 첫 값만, 너무 긴 값은 자름)
const readParam = (value: string | string[] | undefined): string => {
  const first = Array.isArray(value) ? value[0] : value;

  return (first ?? '').trim().slice(0, 100);
};

const formatDate = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
  }).format(date);

// 어드민 게시글 목록: 제목·작성자 검색, 공개 범위·언어 필터, 50개씩
export default async function AdminPostsPage({
  searchParams,
}: AdminPostsPageProps) {
  const i18n = await initLingui();
  await requireAdmin('view');

  const params = await searchParams;
  const q = readParam(params.q);
  const visibility = parseVisibility(readParam(params.visibility));
  const postLocale = parsePostLocale(readParam(params.language));
  const page = parsePageParam(params.page);
  const locale = await getLocale();
  const basePath = adminPath(locale, requireAdminKey(), 'posts');
  const { rows, total } = await listPosts({
    q,
    visibility,
    locale: postLocale,
    page,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className={ADMIN_TITLE_CLASS}>
        <Trans>게시글</Trans>
      </h1>

      <form
        method="get"
        action={basePath}
        className="flex max-w-2xl flex-wrap gap-2"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={100}
          aria-label={i18n._(msg`제목 또는 작성자 검색`)}
          placeholder={i18n._(msg`제목 또는 작성자`)}
          className={`${ADMIN_INPUT_CLASS} min-w-48 flex-1`}
        />
        <select
          name="visibility"
          defaultValue={visibility ?? ''}
          aria-label={i18n._(msg`공개 범위`)}
          className={`${ADMIN_SELECT_CLASS} w-auto`}
        >
          <option value="">{i18n._(msg`공개 범위 전체`)}</option>
          <option value="public">{i18n._(msg`전체 공개`)}</option>
          <option value="unlisted">{i18n._(msg`일부 공개`)}</option>
        </select>
        <select
          name="language"
          defaultValue={postLocale ?? ''}
          aria-label={i18n._(msg`언어`)}
          className={`${ADMIN_SELECT_CLASS} w-auto`}
        >
          <option value="">{i18n._(msg`언어 전체`)}</option>
          <option value="ko">ko</option>
          <option value="en">en</option>
        </select>
        <button type="submit" className={`h-10 shrink-0 ${BRAND_BUTTON_CLASS}`}>
          <Trans>검색</Trans>
        </button>
      </form>

      <AdminTable
        columns={[
          { key: 'title', label: <Trans>제목</Trans> },
          { key: 'author', label: <Trans>작성자</Trans> },
          { key: 'visibility', label: <Trans>공개 범위</Trans> },
          { key: 'language', label: <Trans>언어</Trans> },
          { key: 'publishedAt', label: <Trans>게시일</Trans> },
          {
            key: 'views',
            label: <Trans>조회 수</Trans>,
            className: 'text-right',
          },
          { key: 'status', label: <Trans>상태</Trans> },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            title: (
              <LocalizedLink
                href={`${basePath}/${row.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {row.title || '-'}
              </LocalizedLink>
            ),
            author: row.authorGithubLogin ?? row.authorEmail,
            visibility:
              row.visibility === 'public' ? (
                <Trans>전체 공개</Trans>
              ) : (
                <Trans>일부 공개</Trans>
              ),
            language: row.locale,
            publishedAt: formatDate(row.publishedAt, locale),
            views: row.viewCount,
            status: row.bannedAt ? (
              <span className="border border-danger px-1.5 py-0.5 text-[11px] text-danger">
                <Trans>밴</Trans>
              </span>
            ) : (
              '-'
            ),
          },
        }))}
        empty={<Trans>조건에 맞는 게시글이 없어요</Trans>}
      />

      <AdminPagination
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
        basePath={basePath}
        query={{
          q,
          visibility: visibility ?? '',
          language: postLocale ?? '',
        }}
      />
    </div>
  );
}
