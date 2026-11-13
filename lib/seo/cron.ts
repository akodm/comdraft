import { timingSafeEqual } from 'node:crypto';

/**
 * Vercel Schedules(옛 Cron Jobs) 요청 확인
 * - Vercel 은 CRON_SECRET 이 설정된 프로젝트의 path 스케줄 요청에 `Authorization: Bearer {CRON_SECRET}` 을 붙임
 * - 비밀 값이 없으면 누구도 실행할 수 없게 거절
 */
export const isAuthorizedCronRequest = (
  authorization: string | null,
  secret: string | undefined,
): boolean => {
  if (!secret || !authorization) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
