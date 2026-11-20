import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import {
  ADMIN_SELECT_CLASS,
  ADMIN_TITLE_CLASS,
} from '@/components/admin/admin-styles';
import AdminTable from '@/components/admin/admin-table';
import ConfirmActionButton from '@/components/admin/confirm-action-button';
import { BRAND_BUTTON_CLASS } from '@/components/studio/studio-styles';
import {
  banUser,
  changeUserPlan,
  resetUserUsage,
  revokeUserSessions,
  unbanUser,
} from '@/lib/actions/admin/users';
import { requireAdmin } from '@/lib/admin/guard';
import { canPerform } from '@/lib/admin/roles';
import { formatMicroUsd, summarizeActionDetail } from '@/lib/admin/stats';
import { getUserDetail } from '@/lib/admin/user-queries';
import { getLocale, initLingui } from '@/lib/i18n/server';

interface AdminUserDetailPageProps {
  params: Promise<{ userId: string }>;
}

const SECTION_TITLE_CLASS =
  'text-[15px] leading-[1.4] font-bold tracking-[-0.3px] text-ink';

const formatDateTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);

const InfoRow = ({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
    <dt className="w-32 shrink-0 text-[12px] text-ink-muted">{label}</dt>
    <dd className="min-w-0 text-[13px] break-all text-ink">{children}</dd>
  </div>
);

const PromptStatus = ({ status }: { status: string }) => {
  if (status === 'queued') {
    return <Trans>대기</Trans>;
  }

  if (status === 'running') {
    return <Trans>진행 중</Trans>;
  }

  if (status === 'awaiting_input') {
    return <Trans>답변 대기</Trans>;
  }

  return status === 'completed' ? <Trans>완료</Trans> : <Trans>실패</Trans>;
};

// 어드민 사용자 상세: 기본 정보, 이번 주 사용량, 조치 버튼, 최근 작업과 조치 기록
export default async function AdminUserDetailPage({
  params,
}: AdminUserDetailPageProps) {
  const i18n = await initLingui();
  const admin = await requireAdmin('view');
  const { userId } = await params;
  const detail = await getUserDetail(userId);

  if (!detail) {
    notFound();
  }

  const locale = await getLocale();
  const { user, quota } = detail;
  // 조치 버튼은 권한이 있을 때만 보임 (서버 액션이 권한을 다시 확인)
  const canAct = canPerform(admin.role, 'user.ban');
  const hidden = { userId: user.id };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={ADMIN_TITLE_CLASS}>{user.email}</h1>
        {user.bannedAt ? (
          <span className="border border-danger px-1.5 py-0.5 text-[11px] text-danger">
            <Trans>밴</Trans>
          </span>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>기본 정보</Trans>
        </h2>
        <dl className="flex flex-col gap-2 border border-line bg-white p-4">
          <InfoRow label="ID">{user.id}</InfoRow>
          <InfoRow label={<Trans>이름</Trans>}>{user.name}</InfoRow>
          <InfoRow label="GitHub">{user.githubLogin ?? '-'}</InfoRow>
          <InfoRow label={<Trans>등급</Trans>}>{user.role}</InfoRow>
          <InfoRow label={<Trans>가입일</Trans>}>
            {formatDateTime(user.createdAt, locale)}
          </InfoRow>
          <InfoRow label={<Trans>게시글</Trans>}>{detail.postCount}</InfoRow>
          <InfoRow label={<Trans>로그인 세션</Trans>}>
            {detail.sessionCount}
          </InfoRow>
          {user.bannedAt ? (
            <>
              <InfoRow label={<Trans>밴 시각</Trans>}>
                {formatDateTime(user.bannedAt, locale)}
              </InfoRow>
              <InfoRow label={<Trans>밴 사유</Trans>}>
                {user.banReason ?? '-'}
              </InfoRow>
            </>
          ) : null}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>이번 주 사용량</Trans>
        </h2>
        <dl className="flex flex-col gap-2 border border-line bg-white p-4">
          {quota ? (
            <>
              <InfoRow label={<Trans>사용</Trans>}>
                {formatMicroUsd(quota.used)} / {formatMicroUsd(quota.limit)}
                {quota.limit > 0
                  ? ` (${Math.round((quota.used / quota.limit) * 100)}%)`
                  : ''}
              </InfoRow>
              <InfoRow label={<Trans>남음</Trans>}>
                {formatMicroUsd(quota.remaining)}
              </InfoRow>
              <InfoRow label={<Trans>다음 초기화</Trans>}>
                {formatDateTime(quota.resetsAt, locale)}
              </InfoRow>
            </>
          ) : (
            <p className="text-[13px] text-ink-faint">
              <Trans>이 등급의 사용량 정책이 없어요</Trans>
            </p>
          )}
          {user.quotaResetAt ? (
            <InfoRow label={<Trans>마지막 초기화</Trans>}>
              {formatDateTime(user.quotaResetAt, locale)}
            </InfoRow>
          ) : null}
        </dl>
      </section>

      {canAct ? (
        <section className="flex flex-col gap-3">
          <h2 className={SECTION_TITLE_CLASS}>
            <Trans>조치</Trans>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {user.bannedAt ? (
              <ConfirmActionButton
                action={unbanUser}
                label={i18n._(msg`밴 해제`)}
                confirmLabel={i18n._(msg`해제`)}
                hidden={hidden}
              />
            ) : (
              <ConfirmActionButton
                action={banUser}
                label={i18n._(msg`밴`)}
                confirmLabel={i18n._(msg`밴`)}
                description={
                  <Trans>
                    로그인이 막히고 작성 요청이 거부돼요. 지금 로그인된 곳도
                    모두 끝나요.
                  </Trans>
                }
                danger
                reasonField
                hidden={hidden}
              />
            )}
            <ConfirmActionButton
              action={revokeUserSessions}
              label={i18n._(msg`세션 무효화`)}
              confirmLabel={i18n._(msg`무효화`)}
              description={<Trans>로그인된 곳이 모두 끝나요.</Trans>}
              danger
              hidden={hidden}
            />
            <ConfirmActionButton
              action={resetUserUsage}
              label={i18n._(msg`사용량 초기화`)}
              confirmLabel={i18n._(msg`초기화`)}
              description={
                <Trans>
                  지금 이후에 만든 작업만 이번 주 사용량으로 셈해요. 작업 기록은
                  그대로 남아요.
                </Trans>
              }
              danger
              hidden={hidden}
            />
          </div>
          {/* 등급이 바뀌면 폼을 새로 그려 선택값을 현재 등급으로 맞춤 (액션 뒤 폼 초기화가 처음 값으로 되돌리는 것을 막음) */}
          <form
            key={user.role}
            action={changeUserPlan}
            className="flex max-w-md gap-2"
          >
            <input type="hidden" name="userId" value={user.id} />
            <select
              name="role"
              defaultValue={user.role}
              className={ADMIN_SELECT_CLASS}
            >
              {/* 정책에 없는 등급이면 첫 항목으로 조용히 바뀌지 않도록 현재 값을 보여 줌 */}
              {detail.plans.includes(user.role) ? null : (
                <option value={user.role} disabled>
                  {user.role}
                </option>
              )}
              {detail.plans.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className={`h-10 shrink-0 ${BRAND_BUTTON_CLASS}`}
            >
              <Trans>등급 변경</Trans>
            </button>
          </form>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>최근 작업</Trans>
        </h2>
        <AdminTable
          columns={[
            { key: 'createdAt', label: <Trans>시각</Trans> },
            { key: 'model', label: <Trans>모델</Trans> },
            { key: 'status', label: <Trans>상태</Trans> },
            {
              key: 'cost',
              label: <Trans>비용</Trans>,
              className: 'text-right',
            },
            { key: 'hidden', label: <Trans>숨김</Trans> },
          ]}
          rows={detail.prompts.map((prompt) => ({
            id: prompt.id,
            cells: {
              createdAt: formatDateTime(prompt.createdAt, locale),
              model: prompt.model,
              status: <PromptStatus status={prompt.status} />,
              cost: formatMicroUsd(prompt.usedCost),
              hidden: prompt.hidden ? <Trans>숨김</Trans> : '-',
            },
          }))}
          empty={<Trans>작업이 없어요</Trans>}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>관련 조치 기록</Trans>
        </h2>
        <AdminTable
          columns={[
            { key: 'time', label: <Trans>시각</Trans> },
            { key: 'admin', label: <Trans>어드민</Trans> },
            { key: 'action', label: <Trans>조치</Trans> },
            { key: 'summary', label: <Trans>요약</Trans> },
          ]}
          rows={detail.actions.map((action) => ({
            id: action.id,
            cells: {
              time: formatDateTime(action.createdAt, locale),
              admin: action.loginId ?? <Trans>삭제된 어드민</Trans>,
              action: action.action,
              summary: summarizeActionDetail(action.detail) || '-',
            },
          }))}
          empty={<Trans>조치 기록이 없어요</Trans>}
        />
      </section>
    </div>
  );
}
