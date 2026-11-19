import 'server-only';
// adminPath 가 이미 로케일 접두사를 붙이므로 여기서만 redirect 를 직접 사용
// eslint-disable-next-line no-restricted-imports
import { forbidden, redirect } from 'next/navigation';
import { getRequestLocale } from '@/lib/i18n/request';
import { adminPath, isValidAdminKey } from '@/lib/admin/path-key';
import { type AdminAction, canPerform } from '@/lib/admin/roles';
import { type AdminSessionContext, getAdminSession } from '@/lib/admin/session';

// 어드민 주소 키 (설정이 없거나 형식이 틀리면 어드민 전체 403)
export function requireAdminKey(): string {
  const key = process.env.ADMIN_PATH_KEY;

  if (!isValidAdminKey(key)) {
    forbidden();
  }

  return key;
}

// 현재 요청 로케일의 어드민 화면으로 이동
export async function redirectToAdmin(
  key: string,
  sub?: string,
): Promise<never> {
  redirect(adminPath(await getRequestLocale(), key, sub));
}

/**
 * 콘솔 화면·서버 액션 공용 권한 검사 (서버 액션의 검사가 기준)
 * - 세션 없음 → 로그인 화면, 임시 비밀번호 단계 → 변경 화면, 권한 없음 → 403
 */
export async function requireAdmin(
  action: AdminAction,
): Promise<AdminSessionContext> {
  const key = requireAdminKey();
  const session = await getAdminSession();

  if (!session) {
    return redirectToAdmin(key, 'login');
  }

  if (session.next === 'password') {
    return redirectToAdmin(key, 'password');
  }

  if (!canPerform(session.role, action)) {
    forbidden();
  }

  return session;
}

/**
 * 비밀번호 변경 화면·변경 액션·로그아웃 전용 (로그인만 확인)
 * - 임시 비밀번호 단계와 콘솔에서 바꾸는 경우를 모두 통과시키고 session.next 로 구분
 */
export async function requireAdminPasswordStep(): Promise<AdminSessionContext> {
  const key = requireAdminKey();
  const session = await getAdminSession();

  if (!session) {
    return redirectToAdmin(key, 'login');
  }

  return session;
}
