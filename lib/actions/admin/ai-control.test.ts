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
vi.mock('@/lib/admin/session', () => ({ getAdminSession: vi.fn() }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: vi.fn() }));

// service_setting 한 행을 흉내 내는 DB 대체 (저장한 값을 getAiGenerationSetting 이 그대로 읽음)
const dbState = vi.hoisted(() => ({
  row: null as { value: unknown } | null,
  upserts: [] as Array<{ values: unknown; set: unknown }>,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (values: { value: unknown }) => ({
        onConflictDoUpdate: async ({ set }: { set: { value: unknown } }) => {
          dbState.upserts.push({ values, set });
          dbState.row = { value: set.value };
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (dbState.row ? [dbState.row] : []),
        }),
      }),
    }),
  },
}));

const { getAdminSession } = await import('@/lib/admin/session');
const { logAdminAction } = await import('@/lib/admin/audit');
const { revalidatePath } = await import('next/cache');
const { getAiGenerationSetting } = await import('@/lib/admin/service-setting');
const { pauseAiGeneration, resumeAiGeneration } =
  await import('@/lib/actions/admin/ai-control');

const KEY = 'k3y_abcdefghijklmn';

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
  dbState.row = null;
  dbState.upserts = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('pauseAiGeneration', () => {
  it('editor 는 거부', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('editor'));
    await expect(pauseAiGeneration(form({ reason: '점검' }))).rejects.toThrow(
      'FORBIDDEN',
    );
    expect(dbState.upserts).toHaveLength(0);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it.each([[''], ['   '], ['a'.repeat(501)]])(
    '사유가 %j 이면 거부',
    async (reason) => {
      await expect(pauseAiGeneration(form({ reason }))).rejects.toThrow(
        'invalid_reason',
      );
      expect(dbState.upserts).toHaveLength(0);
    },
  );

  it('admin 이 중지하면 getAiGenerationSetting 이 paused 를 돌려줌', async () => {
    await pauseAiGeneration(form({ reason: ' 모델 점검 ' }));

    expect(await getAiGenerationSetting()).toEqual({
      paused: true,
      reason: '모델 점검',
    });
    expect(dbState.upserts[0].values).toMatchObject({
      key: 'ai_generation',
      updatedBy: 'a1',
    });
    expect(logAdminAction).toHaveBeenCalledWith({
      adminId: 'a1',
      action: 'ai.pause',
      targetType: 'service_setting',
      targetId: 'ai_generation',
      detail: { reason: '모델 점검' },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/ko/admin/${KEY}/ai-control`);
  });
});

describe('resumeAiGeneration', () => {
  it('editor 는 거부', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('editor'));
    await expect(resumeAiGeneration()).rejects.toThrow('FORBIDDEN');
    expect(dbState.upserts).toHaveLength(0);
  });

  it('재개하면 paused 가 false, 사유는 비움', async () => {
    await pauseAiGeneration(form({ reason: '점검' }));
    await resumeAiGeneration();

    expect(await getAiGenerationSetting()).toEqual({
      paused: false,
      reason: null,
    });
    expect(logAdminAction).toHaveBeenLastCalledWith({
      adminId: 'a1',
      action: 'ai.resume',
      targetType: 'service_setting',
      targetId: 'ai_generation',
    });
  });
});
