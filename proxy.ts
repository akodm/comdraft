import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * 세션 쿠키 존재 여부만 확인하는 낙관적 리다이렉트
 * - 쿠키 유효성(DB 세션 존재/만료)은 검증하지 않으므로
 *   실제 인가는 각 페이지/라우트에서 requireSession 으로 처리
 */
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request, {
    cookiePrefix: 'comdraft',
  });

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
