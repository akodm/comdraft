import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSessionContext } from '@/lib/admin/session';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

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

// requireAdmin → canPerform 은 실제로 거치고 세션 조회만 대체
vi.mock('@/lib/admin/session', () => ({ getAdminSession: vi.fn() }));

vi.mock('@/lib/admin/audit', () => ({ logAdminAction: vi.fn() }));

// 업데이트·삭제·조회 체인을 흉내 내는 DB 대체
const dbState = vi.hoisted(() => ({
  updated: [{ id: 'u1' }] as Array<{ id: string }>,
  selectRows: [] as unknown[][],
  set: vi.fn(),
  deleted: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  const makeUpdate = () => ({
    set: (values: unknown) => {
      dbState.set(values);
      const result = Promise.resolve(undefined) as Promise<undefined> & {
        where: () => unknown;
      };
      const whereResult = Object.assign(Promise.resolve(undefined), {
        returning: async () => dbState.updated,
      });
      result.where = () => whereResult;

      return result;
    },
  });
  const makeDelete = () => ({
    where: async () => {
      dbState.deleted();
    },
  });
  const makeSelect = () => ({
    from: () => ({
      where: () => ({
        limit: async () => dbState.selectRows.shift() ?? [],
      }),
    }),
  });
  const tx = { update: makeUpdate, delete: makeDelete };

  return {
    db: {
      ...tx,
      select: makeSelect,
      transaction: async (callback: (t: typeof tx) => Promise<unknown>) =>
        callback(tx),
    },
  };
});

const { getAdminSession } = await import('@/lib/admin/session');
const { logAdminAction } = await import('@/lib/admin/audit');
const { revalidatePath } = await import('next/cache');
const {
  banUser,
  unbanUser,
  revokeUserSessions,
  resetUserUsage,
  changeUserPlan,
} = await import('@/lib/actions/admin/users');

const KEY = 'k3y_abcdefghijklmn';

const session = (
  role: AdminSessionContext['role'] = 'editor',
): AdminSessionContext => ({
  sessionId: 's1',
  adminId: 'a1',
  loginId: 'operator',
  role,
  next: 'console',
});

const form = (fields: Record<string, string>) => {
  const data = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }

  return data;
};

beforeEach(() => {
  vi.stubEnv('ADMIN_PATH_KEY', KEY);
  vi.mocked(getAdminSession).mockResolvedValue(session());
  dbState.updated = [{ id: 'u1' }];
  dbState.selectRows = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('banUser', () => {
  it('viewer 는 거부 (실제 requireAdmin 경유)', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('viewer'));
    await expect(
      banUser(form({ userId: 'u1', reason: '스팸' })),
    ).rejects.toThrow('FORBIDDEN');
    expect(dbState.set).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('사유가 없거나 공백뿐이거나 500자를 넘으면 거부', async () => {
    for (const reason of ['', '   ', 'a'.repeat(501)]) {
      await expect(banUser(form({ userId: 'u1', reason }))).rejects.toThrow(
        'invalid_reason',
      );
    }
    expect(dbState.set).not.toHaveBeenCalled();
  });

  it('밴 표시와 사유를 저장하고 세션을 지운 뒤 기록과 재검증', async () => {
    await banUser(form({ userId: 'u1', reason: '  스팸  ' }));

    expect(dbState.set).toHaveBeenCalledWith(
      expect.objectContaining({
        banReason: '스팸',
        bannedAt: expect.any(Date),
      }),
    );
    expect(dbState.deleted).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith({
      adminId: 'a1',
      action: 'user.ban',
      targetType: 'user',
      targetId: 'u1',
      detail: { reason: '스팸' },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/ko/admin/${KEY}/users`);
    expect(revalidatePath).toHaveBeenCalledWith(`/ko/admin/${KEY}/users/u1`);
  });

  it('없는 사용자면 오류 (기록 없음)', async () => {
    dbState.updated = [];
    await expect(
      banUser(form({ userId: 'nope', reason: '스팸' })),
    ).rejects.toThrow('unknown_user');
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

describe('unbanUser', () => {
  it('밴 표시와 사유를 비움', async () => {
    await unbanUser(form({ userId: 'u1' }));

    expect(dbState.set).toHaveBeenCalledWith({
      bannedAt: null,
      banReason: null,
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.unban', targetId: 'u1' }),
    );
  });
});

describe('revokeUserSessions', () => {
  it('세션을 삭제하고 기록', async () => {
    await revokeUserSessions(form({ userId: 'u1' }));

    expect(dbState.deleted).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.revokeSessions' }),
    );
  });
});

describe('resetUserUsage', () => {
  it('quotaResetAt 을 지금으로', async () => {
    await resetUserUsage(form({ userId: 'u1' }));

    expect(dbState.set).toHaveBeenCalledWith({
      quotaResetAt: expect.any(Date),
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.resetUsage' }),
    );
  });
});

describe('changeUserPlan', () => {
  it('quota_plan 에 없는 등급은 거부', async () => {
    dbState.selectRows = [[]];
    await expect(
      changeUserPlan(form({ userId: 'u1', role: 'ultra' })),
    ).rejects.toThrow('unknown_plan');
    expect(dbState.set).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('등급만 바꾸고 이전 등급을 기록 (사용량 컬럼은 건드리지 않음)', async () => {
    dbState.selectRows = [[{ role: 'pro' }], [{ role: 'basic' }]];
    await changeUserPlan(form({ userId: 'u1', role: 'pro' }));

    expect(dbState.set).toHaveBeenCalledWith({ role: 'pro' });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.changePlan',
        detail: { role: 'pro', from: 'basic' },
      }),
    );
  });
});
