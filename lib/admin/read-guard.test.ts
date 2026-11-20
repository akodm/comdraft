import { describe, expect, it, vi } from 'vitest';

// 어드민 조회 함수는 페이지가 아니라 함수 안에서 권한(view)을 확인해야 함
// → 에이전트 도구처럼 페이지를 거치지 않고 바로 부르는 경우에도 guest·로그아웃 상태는 DB 에 닿지 못함

vi.mock('server-only', () => ({}));

const requireAdmin = vi.fn(async () => {
  throw new Error('DENIED');
});

vi.mock('@/lib/admin/guard', () => ({ requireAdmin }));

// DB 에 닿으면 바로 실패하도록 모든 접근을 막음
const dbTouched = vi.fn();
const blocked: unknown = new Proxy(() => blocked, {
  get: (_, prop) => {
    // await 가 then 을 찾을 때는 thenable 로 보이지 않게 (기록도 하지 않음)
    if (prop === 'then') {
      return undefined;
    }
    dbTouched();
    return blocked;
  },
  apply: () => {
    dbTouched();
    return blocked;
  },
});

vi.mock('@/lib/db', () => ({ db: blocked }));
vi.mock('@/lib/generation/quota-queries', () => ({
  getUserQuota: vi.fn(() => {
    dbTouched();
  }),
}));

const now = new Date('2026-11-20T00:00:00Z');

const READERS: Array<[string, () => Promise<unknown>]> = [
  [
    'listUsers',
    async () =>
      (await import('@/lib/admin/user-queries')).listUsers({ q: '', page: 1 }),
  ],
  [
    'getUserDetail',
    async () => (await import('@/lib/admin/user-queries')).getUserDetail('u1'),
  ],
  [
    'listPosts',
    async () =>
      (await import('@/lib/admin/post-queries')).listPosts({
        q: '',
        page: 1,
        visibility: null,
        locale: null,
      }),
  ],
  [
    'getPostDetail',
    async () => (await import('@/lib/admin/post-queries')).getPostDetail('p1'),
  ],
  [
    'getPostDailyViews',
    async () =>
      (await import('@/lib/admin/post-queries')).getPostDailyViews('p1', 30),
  ],
  [
    'listPromptHistory',
    async () =>
      (await import('@/lib/admin/prompt-history-queries')).listPromptHistory({
        q: '',
        page: 1,
      }),
  ],
  [
    'getPromptDetail',
    async () =>
      (await import('@/lib/admin/prompt-history-queries')).getPromptDetail(
        'j1',
      ),
  ],
  [
    'getDashboardStats',
    async () =>
      (await import('@/lib/admin/stats-queries')).getDashboardStats(now),
  ],
  [
    'getActiveJobs',
    async () => (await import('@/lib/admin/stats-queries')).getActiveJobs(now),
  ],
  [
    'getRecentAdminActions',
    async () =>
      (await import('@/lib/admin/stats-queries')).getRecentAdminActions(20),
  ],
  [
    'listPromptOverview',
    async () =>
      (await import('@/lib/admin/ai-prompt-queries')).listPromptOverview(),
  ],
  [
    'getPromptEditor',
    async () =>
      (await import('@/lib/admin/ai-prompt-queries')).getPromptEditor(
        'ko',
        'tone.plain',
      ),
  ],
  [
    'getAiGenerationState',
    async () =>
      (await import('@/lib/admin/service-setting')).getAiGenerationState(),
  ],
];

describe('어드민 조회 함수의 권한 확인', () => {
  it.each(READERS)(
    '%s 는 view 권한이 없으면 DB 에 닿기 전에 멈춘다',
    async (_, read) => {
      requireAdmin.mockClear();
      dbTouched.mockClear();

      await expect(read()).rejects.toThrow('DENIED');
      expect(requireAdmin).toHaveBeenCalledWith('view');
      expect(dbTouched).not.toHaveBeenCalled();
    },
  );
});
