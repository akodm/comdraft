import { afterEach, describe, expect, it, vi } from 'vitest';

// server-only 는 서버 컴포넌트 밖에서 import 하면 던지므로 테스트에서는 비운다
vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

// 실제 인증 설정은 환경 변수가 필요하므로 getSession 응답만 흉내
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('@/lib/auth/ban', () => ({
  deleteUserSessions: vi.fn(async () => undefined),
}));

// redirect 는 실제처럼 던지게 해서 어디로 갔는지 확인
vi.mock('@/lib/i18n/request', () => ({
  localizedRedirect: vi.fn(async (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

const { auth } = await import('@/lib/auth');
const { deleteUserSessions } = await import('@/lib/auth/ban');
const { requireOnboardingSession, requireSession } =
  await import('@/lib/auth/session');

const getSessionMock = vi.mocked(auth.api.getSession) as unknown as {
  mockResolvedValue: (value: unknown) => void;
  mockReset: () => void;
};

function sessionOf(user: {
  onboardedAt?: Date | null;
  bannedAt?: Date | null;
}) {
  return {
    session: { id: 's1', userId: 'u1' },
    user: { id: 'u1', onboardedAt: null, bannedAt: null, ...user },
  };
}

afterEach(() => {
  getSessionMock.mockReset();
  vi.mocked(deleteUserSessions).mockClear();
});

describe('requireSession', () => {
  it('밴된 사용자의 세션으로 부르면 세션을 지우고 로그인 화면으로', async () => {
    getSessionMock.mockResolvedValue(
      sessionOf({
        onboardedAt: new Date('2026-11-01T00:00:00Z'),
        bannedAt: new Date('2026-11-18T00:00:00Z'),
      }),
    );
    await expect(requireSession()).rejects.toThrow(
      'REDIRECT:/sign-in?error=banned',
    );
    expect(deleteUserSessions).toHaveBeenCalledWith('u1');
  });

  it('온보딩 전이라도 밴이면 로그인 화면으로', async () => {
    getSessionMock.mockResolvedValue(
      sessionOf({ bannedAt: new Date('2026-11-18T00:00:00Z') }),
    );
    await expect(requireSession()).rejects.toThrow(
      'REDIRECT:/sign-in?error=banned',
    );
  });

  it('밴이 아니고 온보딩을 마쳤으면 세션을 돌려줌', async () => {
    const value = sessionOf({ onboardedAt: new Date('2026-11-01T00:00:00Z') });
    getSessionMock.mockResolvedValue(value);
    await expect(requireSession()).resolves.toBe(value);
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });

  it('세션이 없으면 로그인 화면으로 (안내 없음)', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow('REDIRECT:/sign-in');
    expect(deleteUserSessions).not.toHaveBeenCalled();
  });
});

describe('requireOnboardingSession', () => {
  it('밴된 사용자는 세션을 지우고 로그인 화면으로', async () => {
    getSessionMock.mockResolvedValue(
      sessionOf({ bannedAt: new Date('2026-11-18T00:00:00Z') }),
    );
    await expect(requireOnboardingSession()).rejects.toThrow(
      'REDIRECT:/sign-in?error=banned',
    );
    expect(deleteUserSessions).toHaveBeenCalledWith('u1');
  });
});
