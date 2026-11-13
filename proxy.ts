import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import Negotiator from 'negotiator';
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  LOCALES,
  localizePath,
  splitLocalePath,
  type Locale,
} from '@/lib/i18n/config';
import {
  isPostDetailPath,
  isViewerId,
  VIEWER_COOKIE,
  VIEWER_COOKIE_MAX_AGE,
} from '@/lib/posts/post-view';

// 로그인(세션 쿠키)이 필요한 경로 (로케일 접두사를 뗀 경로 기준)
const PROTECTED_PATHS = ['/dashboard', '/onboarding'];

const isProtectedPath = (path: string) => {
  return PROTECTED_PATHS.some(
    (protectedPath) =>
      path === protectedPath || path.startsWith(`${protectedPath}/`),
  );
};

// 로케일 없는 경로로 들어온 요청의 로케일: 마지막 방문 로케일 쿠키 → Accept-Language → 기본 로케일
const getPreferredLocale = (request: NextRequest): Locale => {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;

  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const [negotiated] = new Negotiator({
    headers: {
      'accept-language': request.headers.get('accept-language') ?? undefined,
    },
  }).languages([...LOCALES]);

  return isLocale(negotiated) ? negotiated : DEFAULT_LOCALE;
};

/**
 * 1. 로케일 라우팅: /dashboard → /{locale}/dashboard 로 리다이렉트 (쿼리 유지)
 *    → OAuth errorURL(/sign-in) 처럼 로케일 없이 들어오는 경로도 사용자의 언어로 연결
 * 2. 세션 쿠키 존재 여부만 확인하는 낙관적 리다이렉트
 *    - 쿠키 유효성(DB 세션 존재/만료)은 검증하지 않으므로
 *      실제 인가는 각 페이지/라우트에서 requireSession 으로 처리
 * 3. 요청 경로의 로케일을 헤더로 전달 (root params 를 쓸 수 없는 Server Action 용)
 * - 로케일 쿠키는 읽기만 함 (기록은 LinguiClientProvider)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { locale, path } = splitLocalePath(pathname);

  if (!locale) {
    const url = request.nextUrl.clone();

    url.pathname = localizePath(getPreferredLocale(request), pathname);

    return NextResponse.redirect(url);
  }

  if (
    isProtectedPath(path) &&
    !getSessionCookie(request, { cookiePrefix: 'comdraft' })
  ) {
    // Server Action POST 는 307 을 클라이언트가 처리하지 못함
    // → 통과시켜 액션의 requireSession/requireOnboardingSession 이 로그인 페이지로 이동시킴
    if (!request.headers.has('next-action')) {
      return NextResponse.redirect(
        new URL(localizePath(locale, '/sign-in'), request.url),
      );
    }
  }

  const requestHeaders = new Headers(request.headers);

  requestHeaders.set(LOCALE_HEADER, locale);

  // 마지막 방문 로케일 쿠키는 여기서 쓰지 않음 (LinguiClientProvider 가 실제 렌더링된 로케일로 기록)
  // → Next 가 proxy 실행 전에 next-router-prefetch 등 RSC 헤더를 제거해 prefetch 요청을 구분할 수 없고,
  //   다른 언어 링크를 prefetch 만 해도 쿠키가 바뀌어 버리기 때문
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // 게시글 상세: 비로그인 방문자도 조회 수를 30일에 한 번만 세도록 방문자 ID 쿠키를 심음
  // → 조회 기록 액션은 이 쿠키가 없으면 비로그인 조회를 세지 않음 (쿠키 없이 액션만 반복 호출하는 요청 차단)
  // → 페이지 GET 에만 심음: Next 는 여기서 심은 쿠키를 같은 요청의 cookies() 에도 합치므로,
  //   액션 POST 에 심으면 쿠키 없는 액션 호출이 새 ID 로 매번 세짐
  if (
    request.method === 'GET' &&
    !request.headers.has('next-action') &&
    isPostDetailPath(path) &&
    !isViewerId(request.cookies.get(VIEWER_COOKIE)?.value)
  ) {
    response.cookies.set(VIEWER_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: VIEWER_COOKIE_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 다음을 제외한 모든 경로
     * - api: Better Auth(/api/auth), GitHub App 콜백/설정 URL(/api/github) 은 GitHub 에 등록된 주소 그대로 유지
     * - _next/static, _next/image: 정적 파일, 이미지 최적화
     * - _vercel: Vercel Analytics / Speed Insights 수집 엔드포인트
     * - 확장자가 있는 정적 파일 (favicon.ico, public/ 이미지 등)
     */
    '/((?!api/|_next/static|_next/image|_vercel|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
