import { Plural, Trans } from '@lingui/react/macro';
import StatusMessage from '@/components/dashboard/status-message';
import LocalizedLink from '@/components/shared/localized-link';
import SignOutButton from '@/components/shared/sign-out-button';
import { requireSession } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/dashboard/format';
import { getUserRepositories } from '@/lib/dashboard/queries';
import { getLocale, initLingui } from '@/lib/i18n/server';

interface DashboardPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  await initLingui();
  const locale = await getLocale();
  // proxy 의 쿠키 존재 확인과 별개로, 페이지에서 DB 기준 세션 검증
  const { user } = await requireSession();
  const { status } = await searchParams;
  const repositories = await getUserRepositories(user.id);
  const userName = user.name;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            <Trans>{userName} 님의 대시보드</Trans>
          </h1>
          <p className="text-sm text-gray-600">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <StatusMessage status={status} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            <Trans>추적 중인 저장소</Trans>
          </h2>
          <LocalizedLink
            href="/dashboard/repositories"
            className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
          >
            <Trans>저장소 추가</Trans>
          </LocalizedLink>
        </div>

        {repositories.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-600">
            <Trans>
              아직 등록된 저장소가 없습니다. GitHub App 으로 저장소 권한을
              부여하고 저장소를 추가해주세요.
            </Trans>
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {repositories.map((repository) => {
              const commitCount = repository.commitCount;
              const latestCommittedAt = formatDateTime(
                repository.latestCommittedAt,
                locale,
              );
              const lastSyncedAt = formatDateTime(
                repository.lastSyncedAt,
                locale,
              );

              return (
                <li key={repository.id}>
                  <LocalizedLink
                    href={`/dashboard/repositories/${repository.id}`}
                    className="flex flex-col gap-1 p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{repository.fullName}</span>
                      {repository.isPrivate && (
                        <span className="rounded border px-1.5 text-xs text-gray-600">
                          Private
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      <Plural value={commitCount} other="커밋 #개" /> ·{' '}
                      <Trans>최근 커밋 {latestCommittedAt}</Trans> ·{' '}
                      <Trans>마지막 동기화 {lastSyncedAt}</Trans>
                    </p>
                    {repository.lastSyncError && (
                      <p className="text-sm text-red-600">
                        {repository.lastSyncError}
                      </p>
                    )}
                  </LocalizedLink>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
