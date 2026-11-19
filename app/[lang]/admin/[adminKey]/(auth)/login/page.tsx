import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import LoginForm from '@/components/admin/login-form';
import { redirectToAdmin, requireAdminKey } from '@/lib/admin/guard';
import { getAdminSession } from '@/lib/admin/session';
import { initLingui } from '@/lib/i18n/server';

// 어드민 로그인 화면 (이미 로그인했으면 콘솔 또는 임시 비밀번호 변경 화면으로)
export default async function AdminLoginPage() {
  await initLingui();
  const key = requireAdminKey();
  const session = await getAdminSession();

  if (session) {
    await redirectToAdmin(
      key,
      session.next === 'password' ? 'password' : undefined,
    );
  }

  return (
    <>
      <h1 className={ADMIN_TITLE_CLASS}>
        <Trans>어드민 로그인</Trans>
      </h1>
      <LoginForm />
    </>
  );
}
