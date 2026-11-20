/**
 * 어드민 에이전트 요청에서 모델로 보내는 값 정리
 * - 승인 서명 비밀·출처·Content-Type 검사는 dopus 0.5 가 직접 함 (route.ts 참고)
 */

/** 브라우저가 알려 주는 현재 주소에서 어드민 키를 가림 (모델·외부 API 로 키가 나가지 않게) */
export function maskAdminKey(
  page: string | undefined,
  key: string | undefined,
): string | undefined {
  if (!page || !key) {
    return page;
  }

  return page.split(key).join(':key');
}
