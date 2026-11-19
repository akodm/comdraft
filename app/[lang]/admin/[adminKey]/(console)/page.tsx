import type { ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import AdminTable from '@/components/admin/admin-table';
import RefreshButton from '@/components/admin/refresh-button';
import { requireAdmin } from '@/lib/admin/guard';
import {
  formatElapsed,
  formatMicroUsd,
  summarizeActionDetail,
} from '@/lib/admin/stats';
import {
  getActiveJobs,
  getDashboardStats,
  getRecentAdminActions,
} from '@/lib/admin/stats-queries';
import { getLocale, initLingui } from '@/lib/i18n/server';

const SECTION_TITLE_CLASS =
  'text-[15px] leading-[1.4] font-bold tracking-[-0.3px] text-ink';

// 날짜와 시각 (어드민은 한국 시간 기준으로 보여 줌)
const formatDateTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  // 값 아래 보조 줄 (예: 등급별 수)
  children?: ReactNode;
}

const StatCard = ({ label, value, children }: StatCardProps) => (
  <div className="border border-line bg-white p-4">
    <p className="text-[12px] text-ink-muted">{label}</p>
    <p className="mt-1 text-[24px] leading-[1.2] font-bold text-ink">{value}</p>
    {children ? (
      <div className="mt-2 text-[12px] leading-[1.6] text-ink-faint">
        {children}
      </div>
    ) : null}
  </div>
);

const StatusLabel = ({ status }: { status: string }) => {
  if (status === 'queued') {
    return <Trans>대기</Trans>;
  }

  if (status === 'running') {
    return <Trans>진행 중</Trans>;
  }

  return <Trans>답변 대기</Trans>;
};

const VisibilityLabel = ({ visibility }: { visibility: string }) =>
  visibility === 'public' ? <Trans>전체 공개</Trans> : <Trans>일부 공개</Trans>;

// 어드민 대시보드: 화면을 열 때 한 번 읽고, 새로고침 버튼을 눌렀을 때만 다시 읽음
export default async function AdminDashboardPage() {
  await initLingui();
  await requireAdmin('view');

  const locale = await getLocale();
  const now = new Date();
  const [stats, jobs, actions] = await Promise.all([
    getDashboardStats(now),
    getActiveJobs(now),
    getRecentAdminActions(20),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={ADMIN_TITLE_CLASS}>
          <Trans>대시보드</Trans>
        </h1>
        <RefreshButton readAt={formatDateTime(now, locale)} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>사용자</Trans>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={<Trans>전체</Trans>} value={stats.users.total} />
          <StatCard
            label={
              stats.windowFallback ? (
                <Trans>최근 7일 새 사용자</Trans>
              ) : (
                <Trans>이번 주 새 사용자</Trans>
              )
            }
            value={stats.users.newThisWeek}
          />
          <StatCard label={<Trans>밴</Trans>} value={stats.users.banned} />
          <StatCard
            label={<Trans>등급별</Trans>}
            value={stats.users.byRole.length}
          >
            {stats.users.byRole.map((item) => (
              <p key={item.role}>
                {item.role}: {item.count}
              </p>
            ))}
          </StatCard>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>게시글</Trans>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={<Trans>전체</Trans>} value={stats.posts.total} />
          <StatCard
            label={<Trans>공개 범위별</Trans>}
            value={stats.posts.byVisibility.length}
          >
            {stats.posts.byVisibility.map((item) => (
              <p key={item.visibility}>
                <VisibilityLabel visibility={item.visibility} />: {item.count}
              </p>
            ))}
          </StatCard>
          <StatCard
            label={<Trans>임시 조치(밴)</Trans>}
            value={stats.posts.banned}
          />
          <StatCard
            label={
              stats.windowFallback ? (
                <Trans>최근 7일 새 게시글</Trans>
              ) : (
                <Trans>이번 주 새 게시글</Trans>
              )
            }
            value={stats.posts.newThisWeek}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>AI 사용량</Trans>
        </h2>
        <p className="text-[12px] text-ink-faint">
          {stats.windowFallback ? (
            <Trans>
              기본 등급 정책이 없어 최근 7일 기준이에요 (
              {formatDateTime(stats.windowStart, locale)} 부터)
            </Trans>
          ) : (
            <Trans>
              이번 주 기준이에요 ({formatDateTime(stats.windowStart, locale)}{' '}
              부터)
            </Trans>
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label={<Trans>작업 수</Trans>} value={stats.ai.jobs} />
          <StatCard
            label={<Trans>비용 합</Trans>}
            value={formatMicroUsd(stats.ai.cost)}
          />
          <StatCard label={<Trans>실패</Trans>} value={stats.ai.failed} />
        </div>
        <AdminTable
          columns={[
            { key: 'model', label: <Trans>모델</Trans> },
            {
              key: 'jobs',
              label: <Trans>작업 수</Trans>,
              className: 'text-right',
            },
            {
              key: 'cost',
              label: <Trans>비용</Trans>,
              className: 'text-right',
            },
          ]}
          rows={stats.ai.byModel.map((item) => ({
            id: item.model,
            cells: {
              model: item.model,
              jobs: item.jobs,
              cost: formatMicroUsd(item.cost),
            },
          }))}
          empty={<Trans>이 기간의 AI 작업이 없어요</Trans>}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>진행 중인 AI 작업</Trans>
        </h2>
        <AdminTable
          columns={[
            { key: 'email', label: <Trans>사용자</Trans> },
            { key: 'model', label: <Trans>모델</Trans> },
            { key: 'status', label: <Trans>상태</Trans> },
            { key: 'step', label: <Trans>단계</Trans> },
            { key: 'startedAt', label: <Trans>시작 시각</Trans> },
            { key: 'elapsed', label: <Trans>경과</Trans> },
          ]}
          rows={jobs.map((job) => {
            const since = job.startedAt ?? job.createdAt;

            return {
              id: job.id,
              cells: {
                email: job.email,
                model: job.model,
                status: (
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusLabel status={job.status} />
                    {job.stale ? (
                      <span className="border border-danger px-1.5 py-0.5 text-[11px] text-danger">
                        <Trans>멈춤 의심</Trans>
                      </span>
                    ) : null}
                  </span>
                ),
                step: `${job.step}/3`,
                startedAt: job.startedAt
                  ? formatDateTime(job.startedAt, locale)
                  : '-',
                elapsed: formatElapsed(now.getTime() - since.getTime()),
              },
            };
          })}
          empty={<Trans>진행 중인 작업이 없어요</Trans>}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>최근 조치 기록</Trans>
        </h2>
        <AdminTable
          columns={[
            { key: 'time', label: <Trans>시각</Trans> },
            { key: 'admin', label: <Trans>어드민</Trans> },
            { key: 'action', label: <Trans>조치</Trans> },
            { key: 'target', label: <Trans>대상</Trans> },
            { key: 'summary', label: <Trans>요약</Trans> },
          ]}
          rows={actions.map((action) => ({
            id: action.id,
            cells: {
              time: formatDateTime(action.createdAt, locale),
              admin: action.loginId ?? <Trans>삭제된 어드민</Trans>,
              action: action.action,
              target: action.targetId
                ? `${action.targetType} ${action.targetId}`
                : action.targetType,
              summary: summarizeActionDetail(action.detail) || '-',
            },
          }))}
          empty={<Trans>조치 기록이 없어요</Trans>}
        />
      </section>
    </div>
  );
}
