/**
 * 요청한 클라이언트의 IP (제한·기록용)
 * - Vercel 이 직접 넣는 x-real-ip 를 먼저 씀 (클라이언트가 보낸 값으로 바꿀 수 없음)
 * - 없으면 x-forwarded-for 의 첫 값, 그래도 없으면 'unknown'
 */
export const getClientIp = (headerList: Pick<Headers, 'get'>) => {
  const realIp = headerList.get('x-real-ip')?.trim();
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim();

  return realIp || forwarded || 'unknown';
};
