import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
  ADMIN_INPUT_CLASS,
  ADMIN_TITLE_CLASS,
} from '@/components/admin/admin-styles';
import AdminPagination from '@/components/admin/admin-pagination';
import AdminTable from '@/components/admin/admin-table';
import PromptStatus from '@/components/admin/prompt-status';
import LocalizedLink from '@/components/shared/localized-link';
import { BRAND_BUTTON_CLASS } from '@/components/studio/studio-styles';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { ADMIN_PAGE_SIZE } from '@/lib/admin/pagination';
import { adminPath } from '@/lib/admin/path-key';
import { listPromptHistory } from '@/lib/admin/prompt-history-queries';
import { formatMicroUsd } from '@/lib/admin/stats';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { parsePageParam } from '@/lib/posts/post-list';

interface AdminPromptsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// 검색어 (여러 번 들어오면 첫 값만, 너무 긴 값은 자름)
const readQuery = (value: string | string[] | undefined): string => {
  const first = Array.isArray(value) ? value[0] : value;

  return (first ?? '').trim().slice(0, 100);
};

const formatDateTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

// 어드민 프롬프트 내역: 사용자로 검색, 숨긴 내역도 표시해서 보여 줌, 50개씩
export default async function AdminPromptsPage({
  searchParams,
}: AdminPromptsPageProps) {
  const i18n = await initLingui();
  await requireAdmin('view');

  const params = await searchParams;
  const q = readQuery(params.q);
  const page = parsePageParam(params.page);
  const locale = await getLocale();
  const basePath = adminPath(locale, requireAdminKey(), 'prompts');
  const { rows, total } = await listPromptHistory({ q, page });

  return (
    <div className="flex flex-col gap-6">
      <h1 className={ADMIN_TITLE_CLASS}>
        <Trans>프롬프트 내역</Trans>
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
          { key: 'createdAt', label: <Trans>시각</Trans> },
          { key: 'user', label: <Trans>사용자</Trans> },
          { key: 'draft', label: <Trans>초안</Trans> },
          { key: 'prompt', label: <Trans>요청 문구</Trans> },
          { key: 'model', label: <Trans>모델</Trans> },
          { key: 'status', label: <Trans>상태</Trans> },
          {
            key: 'cost',
            label: <Trans>비용</Trans>,
            className: 'text-right',
          },
          { key: 'hidden', label: <Trans>숨김</Trans> },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            createdAt: (
              <LocalizedLink
                href={`${basePath}/${row.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {formatDateTime(row.createdAt, locale)}
              </LocalizedLink>
            ),
            user: row.userEmail,
            draft:
              row.draftTitle || (row.draftId ? '-' : <Trans>삭제됨</Trans>),
            prompt: <span className="break-all">{row.promptPreview}</span>,
            model: row.model,
            status: <PromptStatus status={row.status} />,
            cost: formatMicroUsd(row.usedCost),
            hidden: row.hidden ? <Trans>숨김</Trans> : '-',
          },
        }))}
        empty={<Trans>조건에 맞는 내역이 없어요</Trans>}
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
