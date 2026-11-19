import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import ConfirmActionButton from '@/components/admin/confirm-action-button';
import {
  pauseAiGeneration,
  resumeAiGeneration,
} from '@/lib/actions/admin/ai-control';
import { requireAdmin } from '@/lib/admin/guard';
import { canPerform } from '@/lib/admin/roles';
import { getAiGenerationState } from '@/lib/admin/service-setting';
import { getLocale, initLingui } from '@/lib/i18n/server';

const formatDateTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);

// 어드민 AI 제어: 새 AI 작성 요청을 잠시 멈추거나 다시 여는 화면
export default async function AdminAiControlPage() {
  const i18n = await initLingui();
  const admin = await requireAdmin('view');
  const locale = await getLocale();
  const state = await getAiGenerationState();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className={ADMIN_TITLE_CLASS}>
        <Trans>AI 제어</Trans>
      </h1>

      <section className="flex flex-col gap-3 border border-line bg-white p-4">
        <p className="text-[15px] font-bold text-ink">
          {state.paused ? (
            <Trans>지금 AI 작성이 멈춰 있어요</Trans>
          ) : (
            <Trans>AI 작성이 정상으로 동작 중이에요</Trans>
          )}
        </p>
        {state.paused && state.reason ? (
          <p className="text-[13px] leading-[1.7] break-words whitespace-pre-wrap text-ink-muted">
            <Trans>사유: {state.reason}</Trans>
          </p>
        ) : null}
        <p className="text-[12px] text-ink-faint">
          {state.updatedAt ? (
            <Trans>
              마지막 변경:{' '}
              {state.updatedByLoginId ?? i18n._(msg`삭제된 어드민`)} ·{' '}
              {formatDateTime(state.updatedAt, locale)}
            </Trans>
          ) : (
            <Trans>아직 바꾼 적이 없어요</Trans>
          )}
        </p>
        <p className="text-[12px] leading-[1.6] text-ink-faint">
          <Trans>
            멈추면 새 작성 요청이 &quot;잠시 멈췄어요&quot; 로 거부돼요. 이미
            진행 중인 작업은 그대로 끝나요.
          </Trans>
        </p>
      </section>

      {state.paused && canPerform(admin.role, 'ai.resume') ? (
        <div>
          <ConfirmActionButton
            action={resumeAiGeneration}
            label={i18n._(msg`AI 작성 재개`)}
            confirmLabel={i18n._(msg`재개`)}
            description={<Trans>새 작성 요청을 다시 받아요.</Trans>}
          />
        </div>
      ) : null}

      {!state.paused && canPerform(admin.role, 'ai.pause') ? (
        <div>
          <ConfirmActionButton
            action={pauseAiGeneration}
            label={i18n._(msg`AI 작성 중지`)}
            confirmLabel={i18n._(msg`중지`)}
            description={
              <Trans>새 작성 요청을 모두 거부해요. 사유는 기록에 남아요.</Trans>
            }
            danger
            reasonField
          />
        </div>
      ) : null}
    </div>
  );
}
