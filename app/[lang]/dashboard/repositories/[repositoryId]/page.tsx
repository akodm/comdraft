import { notFound } from 'next/navigation';
import { msg } from '@lingui/core/macro';
import { Plural, Trans } from '@lingui/react/macro';
import CommitActivity from '@/components/dashboard/commit-activity';
import StatusMessage from '@/components/dashboard/status-message';
import PageLayout from '@/components/layout/page-layout';
import LocalizedLink from '@/components/shared/localized-link';
import SubmitButton from '@/components/shared/submit-button';
import {
  disconnectRepository,
  syncRepository,
} from '@/lib/actions/repositories';
import { requireSession } from '@/lib/auth/session';
import {
  formatDateTime,
  formatNumber,
  getCommitTitle,
} from '@/lib/dashboard/format';
import { getRepositoryStats, getUserRepository } from '@/lib/dashboard/queries';
import { getLocale, initLingui } from '@/lib/i18n/server';

interface RepositoryPageProps {
  params: Promise<{ repositoryId: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function RepositoryPage({
  params,
  searchParams,
}: RepositoryPageProps) {
  const i18n = await initLingui();
  const locale = await getLocale();
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
  const defaultBranch = repository.defaultBranch;
  const lastSyncedAt = formatDateTime(repository.lastSyncedAt, locale);

  return (
    <PageLayout className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <LocalizedLink href="/dashboard" className="text-sm text-gray-600">
          ← <Trans>대시보드</Trans>
        </LocalizedLink>
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
              <Trans>기본 브랜치 {defaultBranch}</Trans> ·{' '}
              <Trans>마지막 동기화 {lastSyncedAt}</Trans>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <form action={syncRepository}>
              <input type="hidden" name="repositoryId" value={repository.id} />
              <SubmitButton pendingText={<Trans>동기화 중...</Trans>}>
                <Trans>동기화</Trans>
              </SubmitButton>
            </form>
            <form action={disconnectRepository}>
              <input type="hidden" name="repositoryId" value={repository.id} />
              <SubmitButton
                pendingText={<Trans>제거 중...</Trans>}
                className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
              >
                <Trans>제거</Trans>
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
          {
            key: 'totalCommits',
            label: msg`전체 커밋`,
            value: formatNumber(summary.totalCommits, locale),
          },
          {
            key: 'contributors',
            label: msg`기여자`,
            value: formatNumber(summary.contributors, locale),
          },
          {
            key: 'firstCommittedAt',
            label: msg`첫 커밋`,
            value: formatDateTime(summary.firstCommittedAt, locale),
          },
          {
            key: 'latestCommittedAt',
            label: msg`최근 커밋`,
            value: formatDateTime(summary.latestCommittedAt, locale),
          },
        ].map(({ key, label, value }) => (
          <div key={key} className="rounded-md border p-3">
            <p className="text-xs text-gray-500">{i18n._(label)}</p>
            <p className="font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-semibold">
          <Trans>최근 30일 커밋</Trans>
        </h2>
        <CommitActivity activity={activity} />
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-semibold">
          <Trans>주요 기여자</Trans>
        </h2>
        {topAuthors.length === 0 ? (
          <p className="text-sm text-gray-600">
            <Trans>커밋 내역이 없습니다.</Trans>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topAuthors.map((author) => {
              const commits = author.commits;

              return (
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
                    <Plural value={commits} other="#개" />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">
          <Trans>최근 커밋</Trans>
        </h2>
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
                  {formatDateTime(commit.committedAt, locale)}
                </p>
              </div>
              <code className="shrink-0 text-xs text-gray-500">
                {commit.sha.slice(0, 7)}
              </code>
            </li>
          ))}
        </ul>
      </section>
    </PageLayout>
  );
}
