import { notFound } from 'next/navigation';
import { Trans } from '@lingui/react/macro';
import DisconnectRepositoryForm from '@/components/dashboard/disconnect-repository-form';
import StatusMessage from '@/components/dashboard/status-message';
import PageLayout from '@/components/layout/page-layout';
import LocalizedLink from '@/components/shared/localized-link';
import { requireSession } from '@/lib/auth/session';
import { getUserRepository } from '@/lib/dashboard/queries';
import { initLingui } from '@/lib/i18n/server';
import { countRepositoryContent } from '@/lib/posts/queries';

interface RepositoryPageProps {
  params: Promise<{ repositoryId: string }>;
  searchParams: Promise<{ status?: string }>;
}

export default async function RepositoryPage({
  params,
  searchParams,
}: RepositoryPageProps) {
  await initLingui();
  const { user } = await requireSession();
  const { repositoryId } = await params;
  const { status } = await searchParams;

  // 본인이 등록한 저장소만 조회 가능
  const repository = await getUserRepository(user.id, repositoryId);

  if (!repository) {
    notFound();
  }

  const branch = repository.branch;
  const content = await countRepositoryContent(user.id, repository.id);

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
              <Trans>추적 브랜치 {branch}</Trans>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <DisconnectRepositoryForm
              repositoryId={repository.id}
              draftCount={content.drafts}
              postCount={content.posts}
            />
          </div>
        </div>
      </header>

      <StatusMessage status={status} />
    </PageLayout>
  );
}
