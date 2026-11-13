'use server';

import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import { deleteUserData, removeUserFiles } from '@/lib/account/delete-account';
import {
  buildGithubGrantRevokeRequest,
  isSessionCookieName,
} from '@/lib/account/delete-account-rules';
import { getRemainingRatio } from '@/lib/account/settings';
import { requireSession } from '@/lib/auth/session';
import { expireStaleJobs } from '@/lib/generation/jobs';
import { getUserQuota } from '@/lib/generation/quota-queries';
import {
  getAuthenticatedGithubUser,
  getGithubUserToken,
} from '@/lib/github/user-api';
import { revalidateSitemap } from '@/lib/seo/revalidate-sitemap';

// 연동한 GitHub 계정 (GitHub 조회에 실패하면 null)
export interface AccountGithubProfile {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export interface AccountSettings {
  // DB 에 저장된 회원 정보 (GitHub 조회가 실패해도 보여 줌)
  name: string;
  email: string;
  image: string | null;
  github: AccountGithubProfile | null;
  // 사용량 등급 (quota_plan.role)
  plan: string;
  // 이번 주 남은 사용량 비율과 초기화 시각 (ISO). 등급의 정책이 없으면 null
  quota: { remainingRatio: number; resetsAt: string } | null;
  // 서버 현재 시각 (ISO, 화면이 기기 시계와의 차이를 맞추는 기준)
  serverNow: string;
}

// GitHub 프로필은 보조 정보라 토큰 만료·API 오류가 나도 화면은 DB 정보로 보여 준다
const loadGithubProfile = async (
  userId: string,
): Promise<AccountGithubProfile | null> => {
  try {
    const token = await getGithubUserToken(userId, await headers());
    const profile = await getAuthenticatedGithubUser(token);

    return {
      login: profile.login,
      name: profile.name,
      avatarUrl: profile.avatar_url,
      htmlUrl: profile.html_url,
    };
  } catch {
    return null;
  }
};

/**
 * 계정 설정 모달을 열 때 한 번 부르는 조회
 * - 회원 정보, 연동한 GitHub 프로필, 등급, 이번 주 남은 사용량 비율, 초기화 시각, 서버 현재 시각
 * - 사용량은 금액을 내보내지 않고 비율만 돌려줌
 * - 멈춘 작업의 예상량이 사용량으로 잡히지 않도록 먼저 시간 초과 처리 (작성 요청 검사와 같은 순서)
 */
export async function getAccountSettings(): Promise<AccountSettings> {
  const { user } = await requireSession();

  await expireStaleJobs({ userId: user.id });

  const [github, quota] = await Promise.all([
    loadGithubProfile(user.id),
    getUserQuota(user.id),
  ]);

  return {
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    github,
    // 컬럼 기본값과 같게 비어 있으면 basic
    plan: user.role ?? 'basic',
    quota: quota
      ? {
          remainingRatio: getRemainingRatio(quota.remaining, quota.limit),
          resetsAt: quota.resetsAt.toISOString(),
        }
      : null,
    serverNow: new Date().toISOString(),
  };
}

export type DeleteAccountResult = { status: 'deleted' } | { status: 'error' };

// GitHub 에서 이 앱에 대한 권한을 철회 (실패해도 탈퇴는 진행, 사용자가 GitHub 설정에서 직접 철회할 수 있음)
const revokeGithubGrant = async (accessToken: string | null) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_SECRET_KEY;

  if (!accessToken || !clientId || !clientSecret) {
    return;
  }

  const { url, init } = buildGithubGrantRevokeRequest(
    clientId,
    clientSecret,
    accessToken,
  );

  await fetch(url, init).catch(() => undefined);
};

/**
 * 회원 탈퇴
 * - GitHub 토큰을 먼저 받아 둔 뒤(계정 행이 지워지므로) 회원 데이터를 삭제하고, 그 토큰으로 GitHub 앱 권한을 철회
 * - 이미지 파일 삭제는 응답 뒤에, 공개 글이 빠지므로 사이트맵도 다시 만들게 함
 * - 로그인 세션 쿠키를 지워 브라우저에도 로그아웃 상태가 되게 함 (언어·방문자 쿠키는 남김)
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { user } = await requireSession();
  const accessToken = await getGithubUserToken(user.id, await headers()).catch(
    () => null,
  );

  try {
    await deleteUserData(user.id);
  } catch {
    return { status: 'error' };
  }

  after(async () => {
    await revokeGithubGrant(accessToken);
    await removeUserFiles(user.id);
  });
  revalidateSitemap();

  const cookieStore = await cookies();

  for (const { name } of cookieStore.getAll()) {
    // __Secure- 쿠키는 Secure 속성이 있어야 브라우저가 삭제를 받아들임 (세션 행은 이미 지워져 쿠키가 남아도 로그인되지 않음)
    if (isSessionCookieName(name)) {
      cookieStore.delete({
        name,
        path: '/',
        secure: name.startsWith('__Secure-'),
      });
    }
  }

  return { status: 'deleted' };
}
