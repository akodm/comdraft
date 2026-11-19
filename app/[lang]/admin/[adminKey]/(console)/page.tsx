import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import { requireAdmin } from '@/lib/admin/guard';
import { initLingui } from '@/lib/i18n/server';

// 어드민 대시보드 (통계와 조치 기록은 다음 작업에서 채움)
export default async function AdminDashboardPage() {
  await initLingui();
  await requireAdmin('view');

  return (
    <h1 className={ADMIN_TITLE_CLASS}>
      <Trans>대시보드</Trans>
    </h1>
  );
}
