import type { AdminRole } from '@/lib/db/schema/admin';

// 어드민 액션. 'view' 는 모든 조회, 나머지는 쓰기 작업
export const ADMIN_ACTIONS = [
  'view',
  'user.ban',
  'user.unban',
  'user.revokeSessions',
  'user.resetUsage',
  'user.changePlan',
  'post.ban',
  'post.unban',
  'prompt.edit',
  'post.delete',
  'history.delete',
  'ai.pause',
  'ai.resume',
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

const VIEWER_ACTIONS: readonly AdminAction[] = ['view'];

const EDITOR_ACTIONS: readonly AdminAction[] = [
  ...VIEWER_ACTIONS,
  'user.ban',
  'user.unban',
  'user.revokeSessions',
  'user.resetUsage',
  'user.changePlan',
  'post.ban',
  'post.unban',
  'prompt.edit',
];

const ROLE_ACTIONS: Record<AdminRole, readonly AdminAction[]> = {
  // guest 는 비밀번호를 정하기 전까지 아무것도 못 함
  guest: [],
  viewer: VIEWER_ACTIONS,
  editor: EDITOR_ACTIONS,
  admin: ADMIN_ACTIONS,
};

export function canPerform(role: AdminRole, action: AdminAction): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

// 로그인 직후 어디로 보낼지. 임시 비밀번호가 남아 있으면 항상 변경 화면
export function canEnter(
  role: AdminRole,
  hasPendingTempPassword: boolean,
): 'console' | 'password' | 'denied' {
  if (hasPendingTempPassword) return 'password';
  return role === 'guest' ? 'denied' : 'console';
}
