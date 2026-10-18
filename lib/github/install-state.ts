import { randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * GitHub App 설치 요청 ↔ 설치 완료 콜백(SETUP_URL)을 같은 브라우저 세션으로 묶기 위한 state (CSRF 방지)
 * - 설치 시작 시 랜덤 값을 HttpOnly 쿠키와 설치 URL 의 state 파라미터에 동시에 담고
 * - 콜백에서 두 값이 일치하는지 확인 후 쿠키 폐기
 */

const STATE_COOKIE = 'comdraft.github_install_state';
const STATE_MAX_AGE = 60 * 10; // 10분

export const createInstallState = async () => {
  const state = randomBytes(32).toString('base64url');
  const cookieStore = await cookies();

  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/github',
    maxAge: STATE_MAX_AGE,
  });

  return state;
};

export const consumeInstallState = async (state: string | null) => {
  const cookieStore = await cookies();
  const expected = cookieStore.get(STATE_COOKIE)?.value;

  cookieStore.delete({ name: STATE_COOKIE, path: '/api/github' });

  if (!state || !expected) {
    return false;
  }

  const received = Buffer.from(state);
  const stored = Buffer.from(expected);

  return received.length === stored.length && timingSafeEqual(received, stored);
};
