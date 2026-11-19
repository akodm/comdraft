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

// select 는 호출 순서대로 미리 넣어 둔 행을 돌려주고, 트랜잭션 안의 쓰기를 기록하는 DB 대체
const dbState = vi.hoisted(() => ({
  selectRows: [] as unknown[][],
  selectWheres: [] as unknown[],
  revisions: [] as unknown[],
  upserts: [] as Array<{ values: unknown; set: unknown }>,
  deletes: [] as unknown[],
  transactions: 0,
}));

vi.mock('@/lib/db', () => {
  const tx = {
    insert: () => ({
      values: (values: unknown) => {
        const isUpsert = 'updatedBy' in (values as object);

        if (!isUpsert) {
          dbState.revisions.push(values);

          return Promise.resolve();
        }

        return {
          onConflictDoUpdate: async ({ set }: { set: unknown }) => {
            dbState.upserts.push({ values, set });
          },
        };
      },
    }),
    delete: () => ({
      where: async (where: unknown) => {
        dbState.deletes.push(where);
      },
    }),
  };

  return {
    db: {
      select: () => ({
        from: () => ({
          where: (where: unknown) => {
            dbState.selectWheres.push(where);

            return { limit: async () => dbState.selectRows.shift() ?? [] };
          },
        }),
      }),
      transaction: async (run: (t: typeof tx) => Promise<void>) => {
        dbState.transactions += 1;
        await run(tx);
      },
    },
  };
});

const { getAdminSession } = await import('@/lib/admin/session');
const { logAdminAction } = await import('@/lib/admin/audit');
const { revalidatePath } = await import('next/cache');
const { savePromptOverride, resetPromptOverride, restorePromptRevision } =
  await import('@/lib/actions/admin/ai-prompts');

const KEY = 'k3y_abcdefghijklmn';
const dialect = new PgDialect();
const compile = (where: unknown) => dialect.sqlToQuery(where as SQL);

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

const DEFAULT_ROW = { requiredMarkers: ['{{a}}', '{{b}}'] };
const FIELDS = { locale: 'ko', key: 'plan.system' };
const GOOD = '앞 {{a}} 가운데 {{b}} 뒤';

beforeEach(() => {
  vi.stubEnv('ADMIN_PATH_KEY', KEY);
  vi.mocked(getAdminSession).mockResolvedValue(session());
  dbState.selectRows = [];
  dbState.selectWheres = [];
  dbState.revisions = [];
  dbState.upserts = [];
  dbState.deletes = [];
  dbState.transactions = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('savePromptOverride', () => {
  it('viewer 는 거부', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('viewer'));
    await expect(
      savePromptOverride({}, form({ ...FIELDS, content: GOOD })),
    ).rejects.toThrow('FORBIDDEN');
    expect(dbState.transactions).toBe(0);
  });

  it('기본값 행이 없는 (locale, key) 는 unknown_prompt', async () => {
    dbState.selectRows = [[]];
    await expect(
      savePromptOverride({}, form({ ...FIELDS, content: GOOD })),
    ).rejects.toThrow('unknown_prompt');
    expect(dbState.transactions).toBe(0);
  });

  it('빈 문장·너무 긴 문장·필수 문자열 누락은 던지지 않고 상태로 돌려줌', async () => {
    dbState.selectRows = [[DEFAULT_ROW]];
    expect(
      await savePromptOverride({}, form({ ...FIELDS, content: '  ' })),
    ).toEqual({ error: 'empty' });

    dbState.selectRows = [[DEFAULT_ROW]];
    expect(
      await savePromptOverride(
        {},
        form({ ...FIELDS, content: '{{a}}{{b}}'.padEnd(20_001, 'x') }),
      ),
    ).toEqual({ error: 'too_long' });

    dbState.selectRows = [[DEFAULT_ROW]];
    expect(
      await savePromptOverride({}, form({ ...FIELDS, content: '{{a}} 만' })),
    ).toEqual({ error: 'missing_markers', missing: ['{{b}}'] });

    expect(dbState.transactions).toBe(0);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('처음 저장하면 이전 값 null 을 이력에 남기고 upsert, 기록에는 내용을 넣지 않음', async () => {
    dbState.selectRows = [[DEFAULT_ROW], []];

    expect(
      await savePromptOverride({}, form({ ...FIELDS, content: GOOD })),
    ).toEqual({ saved: true });

    expect(dbState.transactions).toBe(1);
    expect(dbState.revisions).toEqual([
      expect.objectContaining({
        locale: 'ko',
        key: 'plan.system',
        content: null,
        adminId: 'a1',
      }),
    ]);
    expect(dbState.upserts[0].values).toMatchObject({
      locale: 'ko',
      key: 'plan.system',
      content: GOOD,
      updatedBy: 'a1',
    });
    expect(dbState.upserts[0].set).toMatchObject({
      content: GOOD,
      updatedBy: 'a1',
    });
    expect(logAdminAction).toHaveBeenCalledWith({
      adminId: 'a1',
      action: 'prompt.edit',
      targetType: 'ai_prompt',
      targetId: 'ko:plan.system',
      detail: { locale: 'ko', key: 'plan.system', op: 'save' },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/ko/admin/${KEY}/ai-prompts`);
    expect(revalidatePath).toHaveBeenCalledWith(
      `/ko/admin/${KEY}/ai-prompts/ko/plan.system`,
    );
  });

  it('이미 수정본이 있으면 그 내용을 이력에 남김', async () => {
    dbState.selectRows = [[DEFAULT_ROW], [{ content: '예전 {{a}}{{b}}' }]];
    await savePromptOverride({}, form({ ...FIELDS, content: GOOD }));

    expect(dbState.revisions).toEqual([
      expect.objectContaining({ content: '예전 {{a}}{{b}}' }),
    ]);
  });

  it('현재 수정본과 같으면 아무것도 하지 않음', async () => {
    dbState.selectRows = [[DEFAULT_ROW], [{ content: GOOD }]];

    expect(
      await savePromptOverride({}, form({ ...FIELDS, content: GOOD })),
    ).toEqual({ error: 'unchanged' });
    expect(dbState.transactions).toBe(0);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('기본값 조회는 locale 과 key 를 where 에 담음', async () => {
    dbState.selectRows = [[]];
    await savePromptOverride({}, form({ ...FIELDS, content: GOOD })).catch(
      () => undefined,
    );

    expect(compile(dbState.selectWheres[0]).params).toEqual(
      expect.arrayContaining(['ko', 'plan.system']),
    );
  });
});

describe('resetPromptOverride', () => {
  it('viewer 는 거부', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('viewer'));
    await expect(resetPromptOverride(form(FIELDS))).rejects.toThrow(
      'FORBIDDEN',
    );
  });

  it('수정본이 없으면 아무것도 하지 않음', async () => {
    dbState.selectRows = [[]];
    await resetPromptOverride(form(FIELDS));
    expect(dbState.transactions).toBe(0);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('수정본을 이력에 남기고 행을 지움', async () => {
    dbState.selectRows = [[{ content: '수정본' }]];
    await resetPromptOverride(form(FIELDS));

    expect(dbState.revisions).toEqual([
      expect.objectContaining({ content: '수정본', adminId: 'a1' }),
    ]);
    expect(dbState.deletes).toHaveLength(1);
    expect(compile(dbState.deletes[0]).params).toEqual(
      expect.arrayContaining(['ko', 'plan.system']),
    );
    expect(logAdminAction).toHaveBeenCalledWith({
      adminId: 'a1',
      action: 'prompt.edit',
      targetType: 'ai_prompt',
      targetId: 'ko:plan.system',
      detail: { locale: 'ko', key: 'plan.system', op: 'reset' },
    });
  });
});

describe('restorePromptRevision', () => {
  it('이력이 없으면 unknown_revision', async () => {
    dbState.selectRows = [[]];
    await expect(
      restorePromptRevision(form({ revisionId: 'r1' })),
    ).rejects.toThrow('unknown_revision');
  });

  it('내용이 null 인 이력은 기본값으로 되돌림 (reset 과 같음)', async () => {
    dbState.selectRows = [
      [{ locale: 'ko', key: 'plan.system', content: null }],
      [{ content: '지금 수정본' }],
    ];
    await restorePromptRevision(form({ revisionId: 'r1' }));

    expect(dbState.deletes).toHaveLength(1);
    expect(dbState.upserts).toHaveLength(0);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { locale: 'ko', key: 'plan.system', op: 'restore' },
      }),
    );
  });

  it('이력의 값을 같은 검사를 거쳐 저장', async () => {
    dbState.selectRows = [
      [{ locale: 'ko', key: 'plan.system', content: GOOD }],
      [DEFAULT_ROW],
      [{ content: '지금 수정본 {{a}}{{b}}' }],
    ];
    await restorePromptRevision(form({ revisionId: 'r1' }));

    expect(dbState.upserts[0].values).toMatchObject({ content: GOOD });
    expect(dbState.revisions).toEqual([
      expect.objectContaining({ content: '지금 수정본 {{a}}{{b}}' }),
    ]);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { locale: 'ko', key: 'plan.system', op: 'restore' },
      }),
    );
  });

  it('지금 기본값의 필수 문자열이 빠진 이력은 거부', async () => {
    dbState.selectRows = [
      [{ locale: 'ko', key: 'plan.system', content: '{{a}} 만' }],
      [DEFAULT_ROW],
    ];
    await expect(
      restorePromptRevision(form({ revisionId: 'r1' })),
    ).rejects.toThrow('missing_markers');
    expect(dbState.transactions).toBe(0);
  });
});
