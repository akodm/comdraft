import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import PasswordForm from '@/components/admin/password-form';
import {
  redirectToAdmin,
  requireAdminKey,
  requireAdminPasswordStep,
} from '@/lib/admin/guard';
import { logoutAdmin } from '@/lib/actions/admin/auth';
import { initLingui } from '@/lib/i18n/server';

/**
 * 임시 비밀번호 변경 화면 (로그인만 확인)
 * - 임시 비밀번호 단계가 아니면 현재 비밀번호를 받는 콘솔 쪽 변경 화면으로 보냄
 */
export default async function AdminForcedPasswordPage() {
  await initLingui();
  const session = await requireAdminPasswordStep();

  if (session.next !== 'password') {
    await redirectToAdmin(requireAdminKey(), 'account/password');
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className={ADMIN_TITLE_CLASS}>
          <Trans>비밀번호 변경</Trans>
        </h1>
        <p className="text-[13px] leading-[1.7] break-keep text-ink-muted">
          <Trans>
            임시 비밀번호로 로그인했어요. 새 비밀번호를 정해야 콘솔을 쓸 수
            있어요.
          </Trans>
        </p>
      </div>
      <PasswordForm withCurrent={false} />
      <form action={logoutAdmin} className="flex justify-center">
        <button
          type="submit"
          className="text-[13px] leading-[1.6] text-ink-muted underline hover:text-ink"
        >
          <Trans>로그아웃</Trans>
        </button>
      </form>
    </>
  );
}
