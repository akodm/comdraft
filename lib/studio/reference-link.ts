/**
 * 참고 링크 주소 검증과 표시 (서버/클라이언트 공용)
 * - 주소 형식만 확인하고 서버에서 링크를 열어 보지 않음 (SSRF 방지)
 */

// 저장할 수 있는 주소 최대 길이
export const MAX_REFERENCE_URL_LENGTH = 2048;

// 초안 하나에 추가할 수 있는 참고 링크 수
export const MAX_REFERENCE_LINKS = 10;

export interface ReferenceLink {
  id: string;
  url: string;
}

/**
 * 참고 링크로 쓸 수 있는 주소면 정규화한 주소, 아니면 null
 * - http/https 만 허용, 도메인 형태의 호스트(점 포함) 필요, 아이디/비밀번호가 들어간 주소는 거부
 * @example parseReferenceUrl(' https://developer.mozilla.org ') // 'https://developer.mozilla.org/'
 * @example parseReferenceUrl('javascript:alert(1)') // null
 */
export const parseReferenceUrl = (input: unknown): string | null => {
  if (typeof input !== 'string') {
    return null;
  }

  const value = input.trim();

  if (!value || value.length > MAX_REFERENCE_URL_LENGTH) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.hostname.includes('.') ||
    url.hostname.startsWith('.') ||
    url.hostname.endsWith('.') ||
    url.username ||
    url.password
  ) {
    return null;
  }

  return url.href.length <= MAX_REFERENCE_URL_LENGTH ? url.href : null;
};

/**
 * 목록에 표시할 호스트와 나머지 경로
 * @example splitReferenceUrl('https://www.example.com/docs?a=1') // { host: 'example.com', path: '/docs?a=1' }
 */
export const splitReferenceUrl = (url: string) => {
  const parsed = new URL(url);
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;

  return {
    host: parsed.hostname.replace(/^www\./, ''),
    path: path === '/' ? '' : path,
  };
};

/**
 * 새 초안과 함께 저장할 참고 링크 목록 검증 (중복 제거)
 * - 하나라도 올바르지 않거나 최대 개수를 넘으면 null
 */
export const parseReferenceUrls = (value: unknown): string[] | null => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > MAX_REFERENCE_LINKS) {
    return null;
  }

  const urls = value.map(parseReferenceUrl);

  return urls.every((url) => url !== null) ? [...new Set(urls)] : null;
};
