import { describe, expect, it } from 'vitest';
import {
  type AdminAction,
  ADMIN_ACTIONS,
  canEnter,
  canPerform,
} from '@/lib/admin/roles';
import type { AdminRole } from '@/lib/db/schema/admin';

describe('canPerform', () => {
  it.each([
    ['viewer', 'view', true],
    ['viewer', 'user.ban', false],
    ['editor', 'prompt.edit', true],
    ['editor', 'post.delete', false],
    ['admin', 'ai.pause', true],
    ['guest', 'view', false],
  ] as Array<[AdminRole, AdminAction, boolean]>)(
    '%s 의 %s 권한은 %s',
    (role, action, ok) => {
      expect(canPerform(role, action)).toBe(ok);
    },
  );

  it('guest 는 어떤 액션도 못 함', () => {
    expect(ADMIN_ACTIONS.some((a) => canPerform('guest', a))).toBe(false);
  });

  it('admin 은 모든 액션을 함', () => {
    expect(ADMIN_ACTIONS.every((a) => canPerform('admin', a))).toBe(true);
  });

  it('editor 는 admin 전용 액션만 못 함', () => {
    const denied = ADMIN_ACTIONS.filter((a) => !canPerform('editor', a));
    expect(denied).toEqual([
      'post.delete',
      'history.delete',
      'ai.pause',
      'ai.resume',
    ]);
  });
});

describe('canEnter', () => {
  it('임시 비밀번호가 남은 guest 는 변경 화면만', () =>
    expect(canEnter('guest', true)).toBe('password'));
  it('비밀번호를 정한 뒤 guest 로 돌아가면 입장 불가', () =>
    expect(canEnter('guest', false)).toBe('denied'));
  it('viewer 라도 임시 비밀번호가 다시 발급되면 변경 화면으로', () =>
    expect(canEnter('viewer', true)).toBe('password'));
  it('임시 비밀번호가 없는 viewer 는 콘솔로', () =>
    expect(canEnter('viewer', false)).toBe('console'));
});
