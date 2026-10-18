import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getInstallationUrl } from '@/lib/github/app';
import { createInstallState } from '@/lib/github/install-state';

// 저장소 권한 부여 시작: 로그인 사용자만 GitHub App 설치 페이지로 이동
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  const state = await createInstallState();

  return NextResponse.redirect(getInstallationUrl(state));
}
