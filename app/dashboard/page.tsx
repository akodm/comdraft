import Link from 'next/link';
import StatusMessage from '@/components/dashboard/status-message';
import SignOutButton from '@/components/shared/sign-out-button';
import { requireSession } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/dashboard/format';
import { getUserRepositories } from '@/lib/dashboard/queries';

interface DashboardPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  // proxy 의 쿠키 존재 확인과 별개로, 페이지에서 DB 기준 세션 검증
  const { user } = await requireSession();
  const { status } = await searchParams;
  const repositories = await getUserRepositories(user.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{user.name} 님의 대시보드</h1>
          <p className="text-sm text-gray-600">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <StatusMessage status={status} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">추적 중인 저장소</h2>
          <Link
            href="/dashboard/repositories"
            className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
          >
            저장소 추가
          </Link>
        </div>

        {repositories.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-600">
            아직 등록된 저장소가 없습니다. GitHub App 으로 저장소 권한을
            부여하고 저장소를 추가해주세요.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {repositories.map((repository) => (
              <li key={repository.id}>
                <Link
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
                    커밋 {repository.commitCount.toLocaleString()}개 · 최근 커밋{' '}
                    {formatDateTime(repository.latestCommittedAt)} · 마지막
                    동기화 {formatDateTime(repository.lastSyncedAt)}
                  </p>
                  {repository.lastSyncError && (
                    <p className="text-sm text-red-600">
                      {repository.lastSyncError}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
