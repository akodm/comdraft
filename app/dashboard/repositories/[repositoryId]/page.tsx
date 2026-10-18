import Link from 'next/link';
import { notFound } from 'next/navigation';
import CommitActivity from '@/components/dashboard/commit-activity';
import StatusMessage from '@/components/dashboard/status-message';
import SubmitButton from '@/components/shared/submit-button';
import {
  disconnectRepository,
  syncRepository,
} from '@/app/dashboard/repositories/actions';
import { requireSession } from '@/lib/auth/session';
import { formatDateTime, getCommitTitle } from '@/lib/dashboard/format';
import { getRepositoryStats, getUserRepository } from '@/lib/dashboard/queries';

interface RepositoryPageProps {
  params: Promise<{ repositoryId: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function RepositoryPage({
  params,
  searchParams,
}: RepositoryPageProps) {
  const { user } = await requireSession();
  const { repositoryId } = await params;
  const { status } = await searchParams;

  // 본인이 등록한 저장소만 조회 가능
  const repository = await getUserRepository(user.id, repositoryId);

  if (!repository) {
    notFound();
  }

  const { summary, activity, topAuthors, recentCommits } =
    await getRepositoryStats(repository.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <Link href="/dashboard" className="text-sm text-gray-600">
          ← 대시보드
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <a
              href={repository.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xl font-bold hover:underline"
            >
              {repository.fullName}
            </a>
            {repository.description && (
              <p className="text-sm text-gray-600">{repository.description}</p>
            )}
            <p className="text-xs text-gray-500">
              기본 브랜치 {repository.defaultBranch} · 마지막 동기화{' '}
              {formatDateTime(repository.lastSyncedAt)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <form action={syncRepository}>
              <input type="hidden" name="repositoryId" value={repository.id} />
              <SubmitButton pendingText="동기화 중...">동기화</SubmitButton>
            </form>
            <form action={disconnectRepository}>
              <input type="hidden" name="repositoryId" value={repository.id} />
              <SubmitButton
                pendingText="제거 중..."
                className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
              >
                제거
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>

      <StatusMessage status={status} />

      {repository.lastSyncError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {repository.lastSyncError}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: '전체 커밋', value: summary.totalCommits.toLocaleString() },
          { label: '기여자', value: summary.contributors.toLocaleString() },
          { label: '첫 커밋', value: formatDateTime(summary.firstCommittedAt) },
          {
            label: '최근 커밋',
            value: formatDateTime(summary.latestCommittedAt),
          },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-md border p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-semibold">최근 30일 커밋</h2>
        <CommitActivity activity={activity} />
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-semibold">주요 기여자</h2>
        {topAuthors.length === 0 ? (
          <p className="text-sm text-gray-600">커밋 내역이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topAuthors.map((author) => (
              <li
                key={author.author}
                className="flex items-center gap-2 text-sm"
              >
                {author.avatarUrl ? (
                  <img
                    src={author.avatarUrl}
                    alt=""
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <span className="h-6 w-6 rounded-full bg-gray-200" />
                )}
                <span className="flex-1">{author.author}</span>
                <span className="text-gray-600">
                  {author.commits.toLocaleString()}개
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">최근 커밋</h2>
        <ul className="flex flex-col divide-y rounded-md border">
          {recentCommits.map((commit) => (
            <li key={commit.sha} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <a
                  href={commit.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {getCommitTitle(commit.message)}
                </a>
                <p className="text-xs text-gray-500">
                  {commit.authorLogin ?? commit.authorName ?? 'unknown'} ·{' '}
                  {formatDateTime(commit.committedAt)}
                </p>
              </div>
              <code className="shrink-0 text-xs text-gray-500">
                {commit.sha.slice(0, 7)}
              </code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
