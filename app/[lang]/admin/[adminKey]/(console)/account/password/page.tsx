import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import PasswordForm from '@/components/admin/password-form';
import { requireAdmin } from '@/lib/admin/guard';
import { initLingui } from '@/lib/i18n/server';

// 콘솔에서 비밀번호 변경 (현재 비밀번호 확인)
export default async function AdminAccountPasswordPage() {
  await initLingui();
  await requireAdmin('view');

  return (
    <div className="flex max-w-95 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className={ADMIN_TITLE_CLASS}>
          <Trans>비밀번호 변경</Trans>
        </h1>
        <p className="text-[13px] leading-[1.7] break-keep text-ink-muted">
          <Trans>
            비밀번호를 바꾸면 지금 쓰는 곳을 뺀 다른 곳의 로그인이 모두 끝나요.
          </Trans>
        </p>
      </div>
      <div className="border border-line bg-white p-6">
        <PasswordForm withCurrent />
      </div>
    </div>
  );
}
