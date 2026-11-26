import type { ReactNode } from 'react';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import AdminTable from '@/components/admin/admin-table';
import DailyLineChart from '@/components/admin/daily-line-chart';
import RangeNav from '@/components/admin/range-nav';
import RefreshButton from '@/components/admin/refresh-button';
import { requireAdmin } from '@/lib/admin/guard';
import { parseViewRange } from '@/lib/admin/post-views';
import {
  formatElapsed,
  formatMicroUsd,
  summarizeActionDetail,
} from '@/lib/admin/stats';
import {
  getActiveJobs,
  getDailySignups,
  getDashboardStats,
  getRecentAdminActions,
} from '@/lib/admin/stats-queries';
import { getDailyTraffic } from '@/lib/admin/traffic';
import { getLocale, initLingui } from '@/lib/i18n/server';

const SECTION_TITLE_CLASS =
  'text-[15px] leading-[1.4] font-bold tracking-[-0.3px] text-ink';

const CHART_TITLE_CLASS = 'text-[13px] font-bold text-ink';

// 트래픽 그래프 계열 색 (색약 구분·명도 검사를 통과한 순서, 범례와 표로 보기를 함께 둠)
const TRAFFIC_COLORS = {
  activeUsers: 'var(--color-brand)',
  sessions: '#1baf7a',
  pageViews: '#eb6834',
};

interface AdminDashboardPageProps {
  searchParams: Promise<{ range?: string }>;
}

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
export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  const i18n = await initLingui();
  await requireAdmin('view');

  const locale = await getLocale();
  const now = new Date();
  // 추이 그래프 기간 (?range=7|30|90, 기본 30일)
  const range = parseViewRange((await searchParams).range);
  const [stats, jobs, actions, signups, traffic] = await Promise.all([
    getDashboardStats(now),
    getActiveJobs(now),
    getRecentAdminActions(20),
    getDailySignups(range, now),
    getDailyTraffic(range, now),
  ]);
  const signupTotal = signups.reduce((sum, day) => sum + day.count, 0);
  const trafficTotals =
    traffic.status === 'ok'
      ? traffic.data.reduce(
          (sum, day) => ({
            sessions: sum.sessions + day.sessions,
            pageViews: sum.pageViews + day.pageViews,
          }),
          { sessions: 0, pageViews: 0 },
        )
      : null;

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={SECTION_TITLE_CLASS}>
            <Trans>추이</Trans>
          </h2>
          <RangeNav range={range} label={i18n._(msg`기간`)} />
        </div>

        <div className="flex flex-col gap-2 border border-line bg-panel p-4">
          <h3 className={CHART_TITLE_CLASS}>
            <Trans>새 사용자</Trans>
          </h3>
          <p className="text-[12px] text-ink-muted">
            <Trans>
              최근 {range}일 {signupTotal.toLocaleString(locale)}명 (한국 시간
              기준, 탈퇴한 사용자는 빠져요)
            </Trans>
          </p>
          <DailyLineChart
            data={signups.map((day) => ({
              date: day.date,
              values: { signups: day.count },
              details:
                day.moreCount > 0
                  ? [...day.emails, i18n._(msg`외 ${day.moreCount}명`)]
                  : day.emails,
            }))}
            series={[
              {
                key: 'signups',
                label: i18n._(msg`새 사용자`),
                color: 'var(--color-brand)',
              },
            ]}
            labels={{
              date: i18n._(msg`날짜`),
              table: i18n._(msg`표로 보기`),
              details: i18n._(msg`이메일`),
              summary: i18n._(
                msg`최근 ${range}일 일별 새 사용자, 합계 ${signupTotal}`,
              ),
            }}
            locale={locale}
          />
        </div>

        <div className="flex flex-col gap-2 border border-line bg-panel p-4">
          <h3 className={CHART_TITLE_CLASS}>
            <Trans>사이트 트래픽</Trans>
          </h3>
          {traffic.status === 'ok' && trafficTotals ? (
            <>
              <p className="text-[12px] text-ink-muted">
                <Trans>
                  GA4 기준 최근 {range}일 세션{' '}
                  {trafficTotals.sessions.toLocaleString(locale)} · 페이지뷰{' '}
                  {trafficTotals.pageViews.toLocaleString(locale)} (1시간마다
                  새로 읽고, 오늘 값은 아직 집계 중일 수 있어요)
                </Trans>
              </p>
              <DailyLineChart
                data={traffic.data.map((day) => ({
                  date: day.date,
                  values: {
                    activeUsers: day.activeUsers,
                    sessions: day.sessions,
                    pageViews: day.pageViews,
                  },
                }))}
                series={[
                  {
                    key: 'activeUsers',
                    label: i18n._(msg`방문자`),
                    color: TRAFFIC_COLORS.activeUsers,
                  },
                  {
                    key: 'sessions',
                    label: i18n._(msg`세션`),
                    color: TRAFFIC_COLORS.sessions,
                  },
                  {
                    key: 'pageViews',
                    label: i18n._(msg`페이지뷰`),
                    color: TRAFFIC_COLORS.pageViews,
                  },
                ]}
                labels={{
                  date: i18n._(msg`날짜`),
                  table: i18n._(msg`표로 보기`),
                  summary: i18n._(
                    msg`최근 ${range}일 일별 방문자·세션·페이지뷰 (GA4)`,
                  ),
                }}
                locale={locale}
              />
            </>
          ) : (
            <p className="text-[12px] text-ink-muted">
              {traffic.status === 'unconfigured' ? (
                <Trans>
                  GA4 조회 설정(GOOGLE_REPORT_CREDENTIALS)이 없어 트래픽을 볼 수
                  없어요
                </Trans>
              ) : (
                <Trans>
                  GA4 트래픽을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요
                </Trans>
              )}
            </p>
          )}
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
