import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import Link from 'next/link';
import StatusMessage from '@/components/dashboard/status-message';
import GithubSignInButton from '@/components/shared/github-sign-in-button';
import SubmitButton from '@/components/shared/submit-button';
import { connectRepository } from '@/app/dashboard/repositories/actions';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { githubRepository, userRepository } from '@/lib/db/schema';
import {
  getGithubUserToken,
  GithubUserTokenError,
  listUserInstallationRepositories,
  listUserInstallations,
  type GithubUserInstallation,
  type GithubUserRepository,
} from '@/lib/github/user-api';

interface RepositoriesPageProps {
  searchParams: Promise<{ status?: string }>;
}

interface InstallationWithRepositories {
  installation: GithubUserInstallation;
  repositories: GithubUserRepository[];
}

// GitHub 의 설치 권한 관리 페이지 (저장소 추가/제거, 앱 삭제)
const getInstallationSettingsUrl = ({
  id,
  account,
}: GithubUserInstallation) => {
  return account?.type === 'Organization'
    ? `https://github.com/organizations/${account.login}/settings/installations/${id}`
    : `https://github.com/settings/installations/${id}`;
};

// 사용자 토큰으로 GitHub 에서 직접 조회 → 사용자가 실제 접근 가능한 설치/저장소만 노출
const loadInstallations = async (userId: string) => {
  try {
    const token = await getGithubUserToken(userId, await headers());
    const installations = await listUserInstallations(token);

    const result: InstallationWithRepositories[] = await Promise.all(
      installations.map(async (installation) => ({
        installation,
        repositories: await listUserInstallationRepositories(
          token,
          installation.id,
        ),
      })),
    );

    return { installations: result, needsReauth: false };
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return { installations: [], needsReauth: true };
    }

    throw error;
  }
};

export default async function RepositoriesPage({
  searchParams,
}: RepositoriesPageProps) {
  const { user } = await requireSession();
  const { status } = await searchParams;

  const [{ installations, needsReauth }, trackedRepositories] =
    await Promise.all([
      loadInstallations(user.id),
      db
        .select({
          id: githubRepository.id,
          githubRepoId: githubRepository.githubRepoId,
        })
        .from(userRepository)
        .innerJoin(
          githubRepository,
          eq(userRepository.repositoryId, githubRepository.id),
        )
        .where(eq(userRepository.userId, user.id)),
    ]);

  const trackedByGithubId = new Map(
    trackedRepositories.map(({ id, githubRepoId }) => [githubRepoId, id]),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-gray-600">
            ← 대시보드
          </Link>
          <h1 className="text-xl font-bold">저장소 추가</h1>
        </div>
        {/* GitHub App 설치 페이지에서 계정/조직과 접근 허용할 저장소를 선택 */}
        <a
          href="/api/github/install"
          className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
        >
          GitHub 저장소 권한 부여
        </a>
      </header>

      <StatusMessage status={status} />

      {needsReauth || status === 'github_reauth' ? (
        <section className="flex flex-col items-center gap-3 rounded-md border p-6">
          <p className="text-sm text-gray-600">
            GitHub 인증이 만료되었습니다. 다시 로그인하면 저장소 목록을 불러올
            수 있습니다.
          </p>
          <GithubSignInButton callbackURL="/dashboard/repositories" />
        </section>
      ) : (
        <>
          {installations.length === 0 && (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-600">
              아직 GitHub App 이 설치된 계정이 없습니다. 상단의 &quot;GitHub
              저장소 권한 부여&quot; 버튼으로 커밋을 가져올 저장소를
              선택해주세요.
            </p>
          )}

          {installations.map(({ installation, repositories }) => (
            <section
              key={installation.id}
              className="flex flex-col gap-3 rounded-md border p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {installation.account?.login}
                  </span>
                  <span className="text-xs text-gray-500">
                    {installation.account?.type === 'Organization'
                      ? '조직'
                      : '개인'}{' '}
                    ·{' '}
                    {installation.repository_selection === 'all'
                      ? '모든 저장소'
                      : '선택한 저장소'}
                  </span>
                  {installation.suspended_at && (
                    <span className="text-xs text-red-600">일시 중지됨</span>
                  )}
                </div>
                <a
                  href={getInstallationSettingsUrl(installation)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-gray-600 underline"
                >
                  권한 설정 변경
                </a>
              </div>

              {repositories.length === 0 ? (
                <p className="text-sm text-gray-600">
                  접근 가능한 저장소가 없습니다.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {repositories.map((repository) => {
                    const trackedId = trackedByGithubId.get(repository.id);

                    return (
                      <li
                        key={repository.id}
                        className="flex items-center justify-between gap-4 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {repository.full_name}
                            {repository.private && (
                              <span className="ml-2 rounded border px-1.5 text-xs text-gray-600">
                                Private
                              </span>
                            )}
                          </p>
                          {repository.description && (
                            <p className="truncate text-sm text-gray-600">
                              {repository.description}
                            </p>
                          )}
                        </div>
                        {trackedId ? (
                          <Link
                            href={`/dashboard/repositories/${trackedId}`}
                            className="shrink-0 text-sm text-gray-600 underline"
                          >
                            대시보드 보기
                          </Link>
                        ) : (
                          <form action={connectRepository} className="shrink-0">
                            <input
                              type="hidden"
                              name="installationId"
                              value={installation.id}
                            />
                            <input
                              type="hidden"
                              name="githubRepoId"
                              value={repository.id}
                            />
                            <SubmitButton pendingText="커밋 가져오는 중...">
                              추가
                            </SubmitButton>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
