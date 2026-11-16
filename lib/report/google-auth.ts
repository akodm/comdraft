import { createSign } from 'node:crypto';

/**
 * Google 서비스 계정 인증 (JWT bearer 흐름, 추가 라이브러리 없이 node:crypto 로 서명)
 * - 서비스 계정 키로 서명한 JWT 를 Google 토큰 주소에 보내 1시간짜리 접근 토큰을 받음
 * - 비밀 키와 토큰은 오류 메시지나 로그에 넣지 않음
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_LIFETIME_SECONDS = 3600;
const REQUEST_TIMEOUT_MS = 10_000;

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

// Vercel 환경 변수에 JSON 그대로의 \n 글자로 들어와도, 실제 줄바꿈으로 들어와도 같은 PEM 으로 맞춤
export const normalizePrivateKey = (key: string) =>
  key.replace(/\\n/g, '\n').trim();

// 환경 변수에 서비스 계정 JSON 전체를 넣어도, private_key 값만 넣어도 비밀 키를 꺼냄
export const readServiceAccountPrivateKey = (value: string) => {
  if (!value.trim().startsWith('{')) {
    return value;
  }

  let parsed: { private_key?: unknown };

  try {
    parsed = JSON.parse(value) as { private_key?: unknown };
  } catch {
    // JSON.parse 오류 메시지에는 입력값 일부가 담기므로 그대로 던지지 않음
    throw new Error('서비스 계정 JSON 을 읽을 수 없습니다.');
  }

  const privateKey = parsed.private_key;

  if (typeof privateKey !== 'string' || !privateKey) {
    throw new Error('서비스 계정 JSON 에 private_key 가 없습니다.');
  }

  return privateKey;
};

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

export const buildServiceAccountAssertion = ({
  clientEmail,
  privateKey,
  scopes,
  now,
}: ServiceAccountCredentials & { scopes: string[]; now: Date }) => {
  const iat = Math.floor(now.getTime() / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: clientEmail,
    scope: scopes.join(' '),
    aud: TOKEN_URL,
    iat,
    exp: iat + TOKEN_LIFETIME_SECONDS,
  })}`;

  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(normalizePrivateKey(privateKey))
    .toString('base64url');

  return `${unsigned}.${signature}`;
};

export const fetchGoogleAccessToken = async (
  credentials: ServiceAccountCredentials,
  scopes: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string> => {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildServiceAccountAssertion({
        ...credentials,
        scopes,
        now: new Date(),
      }),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Google 접근 토큰 발급 실패 (${response.status})`);
  }

  const { access_token: accessToken } = (await response.json()) as {
    access_token?: string;
  };

  if (!accessToken) {
    throw new Error('Google 접근 토큰 응답에 토큰이 없습니다.');
  }

  return accessToken;
};

// Google API 를 접근 토큰으로 호출 (JSON 본문이면 POST)
export const callGoogleApi = async <T>(
  url: string,
  accessToken: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<T> => {
  const response = await fetchImpl(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      `Google API 호출 실패 (${new URL(url).host}, ${response.status})`,
    );
  }

  return (await response.json()) as T;
};
