/**
 * 어드민 에이전트 요청(/api/agent) 앞단 검사
 * - 승인 서명 비밀(DOPUS_APPROVAL_SECRET)이 없으면 dopus 가 승인 서명을 아예 검사하지 않음
 *   → 위조한 "승인됨" 요청으로 바꾸는 도구가 바로 실행될 수 있으므로, 비밀이 없으면 요청 자체를 받지 않음
 * - 이 경로는 Server Action 이 아닌 라우트 핸들러라 Next 의 출처 검사를 받지 않음
 *   → 같은 출처(같은 호스트)에서 보낸 JSON 요청만 받음 (다른 하위 도메인·text/plain 단순 요청 차단)
 */

export type AgentRequestCheck =
  | 'ok'
  | 'missing_secret'
  | 'cross_origin'
  | 'not_json';

export function checkAgentRequest(
  request: Request,
  { approvalSecret }: { approvalSecret: string | undefined },
): AgentRequestCheck {
  if (!approvalSecret) {
    return 'missing_secret';
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  const origin = request.headers.get('origin');
  const sameOrigin =
    fetchSite !== null
      ? fetchSite === 'same-origin'
      : origin === new URL(request.url).origin;

  if (!sameOrigin) {
    return 'cross_origin';
  }

  const contentType = request.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().startsWith('application/json')) {
    return 'not_json';
  }

  return 'ok';
}

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
