import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getInstallationUrl } from '@/lib/github/app';
import { createInstallState } from '@/lib/github/install-state';
import { localizePath } from '@/lib/i18n/config';
import { getRequestLocale } from '@/lib/i18n/request';

// 저장소 권한 부여 시작: 로그인 사용자만 GitHub App 설치 페이지로 이동 (온보딩 중에도 허용)
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  // /api 는 proxy 를 거치지 않으므로 마지막 방문 로케일 쿠키 기준으로 이동
  const locale = await getRequestLocale();
  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(localizePath(locale, path), request.url));

  if (!session) {
    return redirectTo('/sign-in');
  }

  const state = await createInstallState();

  return NextResponse.redirect(getInstallationUrl(state));
}
