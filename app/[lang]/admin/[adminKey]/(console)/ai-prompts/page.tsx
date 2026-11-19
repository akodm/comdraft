import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import AdminTable from '@/components/admin/admin-table';
import LocalizedLink from '@/components/shared/localized-link';
import { listPromptOverview } from '@/lib/admin/ai-prompt-queries';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import { getLocale, initLingui } from '@/lib/i18n/server';

const formatDateTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

// 어드민 AI 프롬프트 목록: 로케일별로 묶고 기본값 사용·수정됨 표시
export default async function AdminAiPromptsPage() {
  await initLingui();
  await requireAdmin('view');

  const locale = await getLocale();
  const key = requireAdminKey();
  const rows = await listPromptOverview();

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className={ADMIN_TITLE_CLASS}>
          <Trans>AI 프롬프트</Trans>
        </h1>
        <p className="border border-line bg-white p-4 text-[13px] text-ink-muted">
          <Trans>Lambda 가 아직 기본값을 올리지 않았어요.</Trans>
        </p>
      </div>
    );
  }

  // 정렬된 순서(ko 먼저)를 유지하며 로케일별로 묶음
  const groups = new Map<string, typeof rows>();

  for (const row of rows) {
    groups.set(row.locale, [...(groups.get(row.locale) ?? []), row]);
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className={ADMIN_TITLE_CLASS}>
        <Trans>AI 프롬프트</Trans>
      </h1>

      {[...groups].map(([groupLocale, groupRows]) => (
        <section key={groupLocale} className="flex flex-col gap-3">
          <h2 className="text-[15px] leading-[1.4] font-bold text-ink">
            {groupLocale}
          </h2>
          <AdminTable
            columns={[
              { key: 'key', label: <Trans>키</Trans> },
              { key: 'status', label: <Trans>상태</Trans> },
              { key: 'editor', label: <Trans>마지막 수정자</Trans> },
              { key: 'time', label: <Trans>수정 시각</Trans> },
            ]}
            rows={groupRows.map((row) => ({
              id: row.key,
              cells: {
                key: (
                  <LocalizedLink
                    href={adminPath(
                      locale,
                      key,
                      `ai-prompts/${row.locale}/${encodeURIComponent(row.key)}`,
                    )}
                    className="underline-offset-2 hover:underline"
                  >
                    {row.key}
                  </LocalizedLink>
                ),
                status: row.modified ? (
                  <Trans>수정됨</Trans>
                ) : (
                  <Trans>기본값 사용</Trans>
                ),
                editor: row.modified ? (row.editorLoginId ?? '-') : '-',
                time:
                  row.modified && row.updatedAt
                    ? formatDateTime(row.updatedAt, locale)
                    : '-',
              },
            }))}
            empty={null}
          />
        </section>
      ))}
    </div>
  );
}
