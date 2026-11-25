import 'server-only';
import { incrementRateLimit } from '@/lib/rate-limit';

/**
 * 비로그인 조회 기록 횟수 제한 (IP 당 1시간에 120회)
 * - 쿠키 없이 들어오면 새 방문자 쿠키를 받으므로, 쿠키를 버리며 반복하는 조회 수 부풀리기를 IP 로 막음
 * - 로그인 사용자는 사용자 ID 로 30일에 한 번만 세므로 제한하지 않음
 */
export const ANONYMOUS_VIEW_HOURLY_LIMIT = 120;
const ANONYMOUS_VIEW_WINDOW_MS = 60 * 60 * 1000;

// 이번 기록 시도를 세고 한도 안이면 true
export async function consumeAnonymousViewAttempt(
  ip: string,
): Promise<boolean> {
  const count = await incrementRateLimit(
    `post-view:${ip}`,
    ANONYMOUS_VIEW_WINDOW_MS,
  );

  return count <= ANONYMOUS_VIEW_HOURLY_LIMIT;
}
