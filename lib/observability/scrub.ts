import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

/**
 * Sentry 로 보내기 전 이벤트에서 민감한 내용을 걷어냄 (브라우저·서버·엣지 공통)
 * - 요청 본문, 쿠키, 헤더, 쿼리 문자열은 보내지 않음 (세션 토큰, 입력한 글·코드가 섞일 수 있음)
 * - 오류 메시지는 쿼리 파라미터 뒤를 자르고 토큰 형태를 가린 뒤 길이를 제한
 *   (Drizzle 의 "Failed query: ... params: ..." 처럼 저장 값이 메시지에 실리는 경우 대비)
 * - 콘솔 기록(breadcrumb)은 보내지 않고, 주소 기록은 쿼리 문자열을 지움
 * - 사용자 정보는 내부 id 만 남김 (IP·이메일은 보내지 않음)
 */

const MAX_MESSAGE_LENGTH = 500;
const REDACTED = '[redacted]';

// 메시지에 섞여 들어올 수 있는 비밀값 형태
const SECRET_PATTERNS: RegExp[] = [
  // GitHub 토큰 (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_)
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  // Anthropic, 기타 sk- 형태 키
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  // Authorization 헤더 값
  /\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  // 접속 정보가 들어간 주소 (postgres://user:password@host)
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s@]+@/gi,
  // JWT
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];

// 쿼리와 함께 저장 값이 실리는 꼬리 (Drizzle: "Failed query: ...\nparams: ...")
const QUERY_PARAMS_PATTERN = /\n\s*params:[\s\S]*$/i;

export const maskSecrets = (text: string): string =>
  SECRET_PATTERNS.reduce(
    (masked, pattern) => masked.replace(pattern, REDACTED),
    text,
  );

export const scrubMessage = (message: string): string => {
  const masked = maskSecrets(message.replace(QUERY_PARAMS_PATTERN, ''));

  return masked.length > MAX_MESSAGE_LENGTH
    ? `${masked.slice(0, MAX_MESSAGE_LENGTH)}…`
    : masked;
};

// 주소에서 쿼리 문자열과 해시를 지움 (상대 주소도 처리)
export const stripQuery = (url: string): string => url.replace(/[?#].*$/, '');

export const scrubBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb | null => {
  if (breadcrumb.category === 'console') {
    return null;
  }

  const data = breadcrumb.data ? { ...breadcrumb.data } : undefined;

  if (data) {
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') {
        data[key] = stripQuery(data[key]);
      }
    }

    // 요청·응답 본문 크기 외의 값은 두지 않음
    delete data.body;
    delete data.request_body;
    delete data.response_body;
  }

  return {
    ...breadcrumb,
    ...(breadcrumb.message
      ? { message: scrubMessage(breadcrumb.message) }
      : {}),
    ...(data ? { data } : {}),
  };
};

export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    event.request = {
      ...(event.request.method ? { method: event.request.method } : {}),
      ...(event.request.url ? { url: stripQuery(event.request.url) } : {}),
    };
  }

  if (event.message) {
    event.message = scrubMessage(event.message);
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = scrubMessage(exception.value);
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);
  }

  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }

  return event;
};
