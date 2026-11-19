import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
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

vi.mock('@/lib/admin/session', () => ({ getAdminSession: vi.fn() }));

vi.mock('@/lib/admin/audit', () => ({ logAdminAction: vi.fn() }));

// 수정(원자적 숨김)·재조회 체인을 흉내 내고 where 인자를 기록하는 DB 대체
const dbState = vi.hoisted(() => ({
  updated: [{ id: 'j1' }] as Array<{ id: string }>,
  selectRows: [] as unknown[][],
  set: vi.fn(),
  updateWheres: [] as unknown[],
  selectWheres: [] as unknown[],
  deleted: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        dbState.set(values);

        return {
          where: (where: unknown) => {
            dbState.updateWheres.push(where);

            return { returning: async () => dbState.updated };
          },
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          dbState.selectWheres.push(where);

          return { limit: async () => dbState.selectRows.shift() ?? [] };
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        dbState.deleted();
      },
    }),
  },
}));

const { getAdminSession } = await import('@/lib/admin/session');
const { logAdminAction } = await import('@/lib/admin/audit');
const { revalidatePath } = await import('next/cache');
const { deletePromptHistory } =
  await import('@/lib/actions/admin/prompt-history');

const KEY = 'k3y_abcdefghijklmn';
const dialect = new PgDialect();

// where 조건을 SQL 문자열과 바인딩 값으로 풀어 확인
const compile = (where: unknown) => dialect.sqlToQuery(where as SQL);

const session = (
  role: AdminSessionContext['role'] = 'admin',
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
  dbState.updated = [{ id: 'j1' }];
  dbState.selectRows = [];
  dbState.updateWheres = [];
  dbState.selectWheres = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('deletePromptHistory', () => {
  it('editor 는 거부 (실제 requireAdmin 경유)', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('editor'));
    await expect(deletePromptHistory(form({ jobId: 'j1' }))).rejects.toThrow(
      'FORBIDDEN',
    );
    expect(dbState.set).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('작업 id 가 없으면 거부', async () => {
    await expect(deletePromptHistory(form({}))).rejects.toThrow('invalid_job');
  });

  it('행을 지우지 않고 deletedAt 만 채우며, 대상 id 와 정착 조건을 where 에 담음', async () => {
    await deletePromptHistory(form({ jobId: 'j1' }));

    expect(dbState.deleted).not.toHaveBeenCalled();
    expect(dbState.set).toHaveBeenCalledTimes(1);
    expect(dbState.set).toHaveBeenCalledWith({ deletedAt: expect.any(Date) });

    const { sql, params } = compile(dbState.updateWheres[0]);

    expect(params).toContain('j1');
    expect(sql).toContain('"deleted_at" is null');
    // 진행 중 작업과 반영 전 완료 작업은 조건에서 빠짐 (실패 또는 반영된 완료만 허용)
    expect(params).toEqual(expect.arrayContaining(['failed', 'completed']));
    expect(params).not.toContain('queued');
    expect(params).not.toContain('running');
    expect(params).not.toContain('awaiting_input');
    expect(sql).toContain('"applied_at" is not null');
  });

  it('성공하면 기록과 재검증 (프롬프트 문구는 기록하지 않음)', async () => {
    await deletePromptHistory(form({ jobId: 'j1' }));

    expect(logAdminAction).toHaveBeenCalledWith({
      adminId: 'a1',
      action: 'history.delete',
      targetType: 'prompt_history',
      targetId: 'j1',
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/ko/admin/${KEY}/prompts`);
    expect(revalidatePath).toHaveBeenCalledWith(`/ko/admin/${KEY}/prompts/j1`);
  });

  it('조건에 맞는 행이 없고 작업이 없으면 not_found', async () => {
    dbState.updated = [];
    dbState.selectRows = [[]];
    await expect(deletePromptHistory(form({ jobId: 'nope' }))).rejects.toThrow(
      'not_found',
    );
    expect(paramsOfWhere(dbState.selectWheres[0])).toContain('nope');
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it.each([
    ['queued', null],
    ['running', null],
    ['awaiting_input', null],
    ['completed', null],
  ])('%s (반영 %s) 이면 job_active', async (status, appliedAt) => {
    dbState.updated = [];
    dbState.selectRows = [[{ status, appliedAt, deletedAt: null }]];
    await expect(deletePromptHistory(form({ jobId: 'j1' }))).rejects.toThrow(
      'job_active',
    );
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('이미 숨긴 내역이면 아무것도 하지 않고 성공 (멱등, 기록 없음)', async () => {
    dbState.updated = [];
    dbState.selectRows = [
      [{ status: 'completed', appliedAt: new Date(), deletedAt: new Date() }],
    ];
    await expect(
      deletePromptHistory(form({ jobId: 'j1' })),
    ).resolves.toBeUndefined();
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

function paramsOfWhere(where: unknown): unknown[] {
  return compile(where).params;
}
