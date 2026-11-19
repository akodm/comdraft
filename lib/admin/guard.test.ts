import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionContext } from '@/lib/admin/session';

// server-only 는 서버 컴포넌트 밖에서 import 하면 던지므로 테스트에서는 비운다
vi.mock('server-only', () => ({}));

// redirect / forbidden 은 실제처럼 던지게 해서 어디로 갔는지 확인
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  forbidden: vi.fn(() => {
    throw new Error('FORBIDDEN');
  }),
}));

vi.mock('@/lib/i18n/request', () => ({
  getRequestLocale: vi.fn(async () => 'ko'),
}));

vi.mock('@/lib/admin/session', () => ({
  getAdminSession: vi.fn(),
}));

const { getAdminSession } = await import('@/lib/admin/session');
const { requireAdmin, requireAdminPasswordStep } =
  await import('@/lib/admin/guard');

const KEY = 'k3y_abcdefghijklmn';

function session(
  overrides: Partial<AdminSessionContext> = {},
): AdminSessionContext {
  return {
    sessionId: 's1',
    adminId: 'a1',
    loginId: 'operator',
    role: 'viewer',
    next: 'console',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('ADMIN_PATH_KEY', KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(getAdminSession).mockReset();
});

describe('requireAdmin', () => {
  it('세션이 없으면 로그인 화면으로 redirect', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(null);
    await expect(requireAdmin('view')).rejects.toThrow(
      `REDIRECT:/ko/admin/${KEY}/login`,
    );
  });

  it('guest(변경 단계) 세션으로 콘솔 액션을 부르면 변경 화면으로 redirect', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(
      session({ role: 'guest', next: 'password' }),
    );
    await expect(requireAdmin('view')).rejects.toThrow(
      `REDIRECT:/ko/admin/${KEY}/password`,
    );
  });

  it('viewer 가 user.ban 을 부르면 forbidden', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session({ role: 'viewer' }));
    await expect(requireAdmin('user.ban')).rejects.toThrow('FORBIDDEN');
  });

  it('editor 가 prompt.edit 를 부르면 통과', async () => {
    const editor = session({ role: 'editor' });
    vi.mocked(getAdminSession).mockResolvedValue(editor);
    await expect(requireAdmin('prompt.edit')).resolves.toEqual(editor);
  });

  it('주소 키 설정이 없거나 틀리면 세션과 상관없이 forbidden', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session({ role: 'admin' }));
    vi.stubEnv('ADMIN_PATH_KEY', 'short');
    await expect(requireAdmin('view')).rejects.toThrow('FORBIDDEN');
  });
});

describe('requireAdminPasswordStep', () => {
  it('세션이 없으면 로그인 화면으로 redirect', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(null);
    await expect(requireAdminPasswordStep()).rejects.toThrow(
      `REDIRECT:/ko/admin/${KEY}/login`,
    );
  });

  it('변경 단계 세션과 콘솔 세션 모두 통과', async () => {
    const pending = session({ role: 'guest', next: 'password' });
    vi.mocked(getAdminSession).mockResolvedValue(pending);
    await expect(requireAdminPasswordStep()).resolves.toEqual(pending);

    const active = session({ role: 'editor' });
    vi.mocked(getAdminSession).mockResolvedValue(active);
    await expect(requireAdminPasswordStep()).resolves.toEqual(active);
  });

  it('주소 키 설정이 없으면 forbidden', async () => {
    vi.stubEnv('ADMIN_PATH_KEY', '');
    vi.mocked(getAdminSession).mockResolvedValue(session());
    await expect(requireAdminPasswordStep()).rejects.toThrow('FORBIDDEN');
  });
});
