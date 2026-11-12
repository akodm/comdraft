'use server';

import { headers } from 'next/headers';
import { getRemainingRatio } from '@/lib/account/settings';
import { requireSession } from '@/lib/auth/session';
import { expireStaleJobs } from '@/lib/generation/jobs';
import { getUserQuota } from '@/lib/generation/quota-queries';
import {
  getAuthenticatedGithubUser,
  getGithubUserToken,
} from '@/lib/github/user-api';

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
