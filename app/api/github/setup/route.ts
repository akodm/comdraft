import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { upsertInstallation } from '@/lib/github/installation';
import { consumeInstallState } from '@/lib/github/install-state';
import {
  findUserInstallation,
  getGithubUserToken,
  GithubUserTokenError,
} from '@/lib/github/user-api';

/**
 * GitHub App 설치/권한 변경 후 돌아오는 SETUP_URL (/api/github/setup)
 * - setup_action=install: 우리 앱에서 시작한 설치 → state 검증 필수
 * - setup_action=update: GitHub 설정 화면에서 저장소 선택을 바꾼 경우 → state 없음
 * - setup_action=request: 조직 소유자 승인 대기
 * 어떤 경우든 installation_id 는 위조 가능하므로 사용자 토큰으로 GitHub 에 접근 권한을 재확인
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, request.url));

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return redirectTo('/sign-in');
  }

  const setupAction = searchParams.get('setup_action');

  if (setupAction === 'request') {
    return redirectTo('/dashboard/repositories?status=requested');
  }

  if (setupAction === 'install') {
    const isValidState = await consumeInstallState(searchParams.get('state'));

    if (!isValidState) {
      return redirectTo('/dashboard/repositories?status=invalid_state');
    }
  }

  const installationId = Number(searchParams.get('installation_id'));

  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    return redirectTo('/dashboard/repositories?status=invalid_installation');
  }

  try {
    const token = await getGithubUserToken(session.user.id, request.headers);
    const installation = await findUserInstallation(token, installationId);

    if (!installation) {
      return redirectTo('/dashboard/repositories?status=invalid_installation');
    }

    await upsertInstallation(installation, session.user.id);
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return redirectTo('/dashboard/repositories?status=github_reauth');
    }

    throw error;
  }

  return redirectTo(
    `/dashboard/repositories?status=installed&installation=${installationId}`,
  );
}
