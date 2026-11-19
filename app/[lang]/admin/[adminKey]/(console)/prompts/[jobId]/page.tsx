import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import AdminTable from '@/components/admin/admin-table';
import ConfirmActionButton from '@/components/admin/confirm-action-button';
import PromptStatus from '@/components/admin/prompt-status';
import LocalizedLink from '@/components/shared/localized-link';
import { deletePromptHistory } from '@/lib/actions/admin/prompt-history';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import { isPromptSettled } from '@/lib/admin/prompt-history-rules';
import { getPromptDetail } from '@/lib/admin/prompt-history-queries';
import { canPerform } from '@/lib/admin/roles';
import { formatMicroUsd, summarizeActionDetail } from '@/lib/admin/stats';
import { getLocale, initLingui } from '@/lib/i18n/server';

interface AdminPromptDetailPageProps {
  params: Promise<{ jobId: string }>;
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

const joinOrDash = (values: string[]) =>
  values.length > 0 ? values.join(', ') : '-';

// 어드민 프롬프트 내역 상세: 요청 문구 전문, 옵션, 커밋, 링크, 오류, 사용량, 숨김 조치와 기록
export default async function AdminPromptDetailPage({
  params,
}: AdminPromptDetailPageProps) {
  const i18n = await initLingui();
  const admin = await requireAdmin('view');
  const { jobId } = await params;
  const detail = await getPromptDetail(jobId);

  if (!detail) {
    notFound();
  }

  const locale = await getLocale();
  const key = requireAdminKey();
  const canHide = canPerform(admin.role, 'history.delete');
  // 숨기기는 완전히 끝난 작업만 가능 (서버 액션이 같은 조건으로 다시 확인)
  const settled = isPromptSettled(detail);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={ADMIN_TITLE_CLASS}>
          <Trans>프롬프트 내역</Trans>
        </h1>
        {detail.deletedAt ? (
          <span className="border border-line px-1.5 py-0.5 text-[11px] text-ink-muted">
            <Trans>숨김</Trans>
          </span>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>요청 문구</Trans>
        </h2>
        <p className="border border-line bg-white p-4 text-[13px] leading-[1.7] break-words whitespace-pre-wrap text-ink">
          {detail.prompt}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>작업 정보</Trans>
        </h2>
        <dl className="flex flex-col gap-2 border border-line bg-white p-4">
          <InfoRow label="ID">{detail.id}</InfoRow>
          <InfoRow label={<Trans>사용자</Trans>}>
            <LocalizedLink
              href={adminPath(locale, key, `users/${detail.userId}`)}
              className="underline-offset-2 hover:underline"
            >
              {detail.userEmail}
            </LocalizedLink>
          </InfoRow>
          <InfoRow label={<Trans>초안</Trans>}>
            {detail.draftId ? detail.draftTitle || '-' : <Trans>삭제됨</Trans>}
          </InfoRow>
          <InfoRow label={<Trans>종류</Trans>}>{detail.kind}</InfoRow>
          <InfoRow label={<Trans>상태</Trans>}>
            <PromptStatus status={detail.status} />
            {` (step ${detail.step})`}
          </InfoRow>
          <InfoRow label={<Trans>오류 코드</Trans>}>
            {detail.errorCode ?? '-'}
          </InfoRow>
          <InfoRow label={<Trans>모델</Trans>}>{detail.model}</InfoRow>
          <InfoRow label={<Trans>언어</Trans>}>{detail.locale}</InfoRow>
          <InfoRow label={<Trans>말투</Trans>}>{detail.tone}</InfoRow>
          <InfoRow label={<Trans>글 유형</Trans>}>{detail.postType}</InfoRow>
          <InfoRow label={<Trans>길이</Trans>}>{detail.length}</InfoRow>
          <InfoRow label={<Trans>필수 항목</Trans>}>
            {joinOrDash(detail.requiredBlocks)}
          </InfoRow>
          <InfoRow label={<Trans>커밋 SHA</Trans>}>
            {joinOrDash(detail.commitShas)}
          </InfoRow>
          <InfoRow label={<Trans>참고 링크</Trans>}>
            {joinOrDash(detail.referenceUrls)}
          </InfoRow>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>사용량</Trans>
        </h2>
        <dl className="flex flex-col gap-2 border border-line bg-white p-4">
          <InfoRow label={<Trans>사용 토큰</Trans>}>
            {detail.usedTokens.toLocaleString('en-US')}
          </InfoRow>
          <InfoRow label={<Trans>사용 비용</Trans>}>
            {formatMicroUsd(detail.usedCost)}
          </InfoRow>
          <InfoRow label={<Trans>예상 비용</Trans>}>
            {detail.estimatedCost === null
              ? '-'
              : formatMicroUsd(detail.estimatedCost)}
          </InfoRow>
          <InfoRow label={<Trans>만든 시각</Trans>}>
            {formatDateTime(detail.createdAt, locale)}
          </InfoRow>
          <InfoRow label={<Trans>시작</Trans>}>
            {detail.startedAt ? formatDateTime(detail.startedAt, locale) : '-'}
          </InfoRow>
          <InfoRow label={<Trans>종료</Trans>}>
            {detail.finishedAt
              ? formatDateTime(detail.finishedAt, locale)
              : '-'}
          </InfoRow>
          <InfoRow label={<Trans>초안 반영</Trans>}>
            {detail.appliedAt ? formatDateTime(detail.appliedAt, locale) : '-'}
          </InfoRow>
          {detail.deletedAt ? (
            <InfoRow label={<Trans>숨긴 시각</Trans>}>
              {formatDateTime(detail.deletedAt, locale)}
            </InfoRow>
          ) : null}
        </dl>
      </section>

      {canHide && !detail.deletedAt ? (
        <section className="flex flex-col gap-3">
          <h2 className={SECTION_TITLE_CLASS}>
            <Trans>조치</Trans>
          </h2>
          {settled ? (
            <div className="flex flex-wrap items-center gap-2">
              <ConfirmActionButton
                action={deletePromptHistory}
                label={i18n._(msg`내역 숨기기`)}
                confirmLabel={i18n._(msg`숨기기`)}
                description={
                  <Trans>
                    사용자 화면에서 이 내역이 빠져요. 사용량과 통계에는 그대로
                    남아요.
                  </Trans>
                }
                danger
                hidden={{ jobId: detail.id }}
              />
            </div>
          ) : (
            <p className="text-[13px] text-ink-faint">
              <Trans>끝나지 않은 작업은 숨길 수 없어요</Trans>
            </p>
          )}
        </section>
      ) : null}

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
