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

vi.mock('@/lib/seo/revalidate-sitemap', () => ({ revalidateSitemap: vi.fn() }));

vi.mock('@/lib/posts/moderation-queries', () => ({ applyModeration: vi.fn() }));

// drizzle 조건(SQL)에 들어간 바인딩 값만 모아, 어떤 id 를 대상으로 했는지 확인
const paramsOf = (node: unknown): unknown[] => {
  if (node === null || typeof node !== 'object') {
    return [];
  }

  const chunks = (node as { queryChunks?: unknown[] }).queryChunks;

  if (Array.isArray(chunks)) {
    return chunks.flatMap(paramsOf);
  }

  if ('value' in node && 'encoder' in node) {
    return [(node as { value: unknown }).value];
  }

  return [];
};

// 삭제·수정 체인을 흉내 내고 where 인자를 기록하는 DB 대체
const dbState = vi.hoisted(() => ({
  deletedRows: [] as Array<{ id: string; draftId: string; title: string }>,
  deleteWheres: [] as unknown[],
  updates: [] as Array<{ values: unknown; where: unknown }>,
  order: [] as string[],
}));

vi.mock('@/lib/db', () => {
  const tx = {
    delete: () => ({
      where: (where: unknown) => {
        dbState.deleteWheres.push(where);
        dbState.order.push('delete');

        return { returning: async () => dbState.deletedRows };
      },
    }),
    update: () => ({
      set: (values: unknown) => ({
        where: async (where: unknown) => {
          dbState.updates.push({ values, where });
          dbState.order.push('update');
        },
      }),
    }),
  };

  return {
    db: {
      transaction: async (callback: (t: typeof tx) => Promise<unknown>) =>
        callback(tx),
    },
  };
});

const { getAdminSession } = await import('@/lib/admin/session');
const { logAdminAction } = await import('@/lib/admin/audit');
const { revalidatePath } = await import('next/cache');
const { revalidateSitemap } = await import('@/lib/seo/revalidate-sitemap');
const { applyModeration } = await import('@/lib/posts/moderation-queries');
const { banPost, unbanPost, deletePost } =
  await import('@/lib/actions/admin/posts');

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
  vi.mocked(applyModeration).mockResolvedValue('banned');
  dbState.deletedRows = [{ id: 'p1', draftId: 'd1', title: '제목' }];
  dbState.deleteWheres = [];
  dbState.updates = [];
  dbState.order = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('banPost', () => {
  it('viewer 는 거부', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('viewer'));
    await expect(
      banPost(form({ postId: 'p1', reason: '스팸' })),
    ).rejects.toThrow('FORBIDDEN');
    expect(applyModeration).not.toHaveBeenCalled();
  });

  it('사유가 없거나 500자를 넘으면 거부', async () => {
    for (const reason of ['', '   ', 'a'.repeat(501)]) {
      await expect(banPost(form({ postId: 'p1', reason }))).rejects.toThrow(
        'invalid_reason',
      );
    }
    expect(applyModeration).not.toHaveBeenCalled();
  });

  it('게시글 id 가 없으면 거부', async () => {
    await expect(banPost(form({ reason: '스팸' }))).rejects.toThrow(
      'invalid_post',
    );
  });

  it('검수 API 와 같은 조치를 대상 id 로 하고 사이트맵·기록·재검증', async () => {
    await banPost(form({ postId: 'p1', reason: '  스팸  ' }));

    expect(applyModeration).toHaveBeenCalledWith({
      postId: 'p1',
      action: 'ban',
      reason: '스팸',
    });
    expect(revalidateSitemap).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith({
      adminId: 'a1',
      action: 'post.ban',
      targetType: 'post',
      targetId: 'p1',
      detail: { reason: '스팸' },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/ko/admin/${KEY}/posts`);
    expect(revalidatePath).toHaveBeenCalledWith(`/ko/admin/${KEY}/posts/p1`);
  });

  it('없는 게시글이면 오류 (기록·사이트맵 없음)', async () => {
    vi.mocked(applyModeration).mockResolvedValue('not_found');
    await expect(
      banPost(form({ postId: 'nope', reason: '스팸' })),
    ).rejects.toThrow('unknown_post');
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(revalidateSitemap).not.toHaveBeenCalled();
  });
});

describe('unbanPost', () => {
  it('editor 도 가능, 사유 없이 해제하고 사이트맵·기록', async () => {
    vi.mocked(applyModeration).mockResolvedValue('unbanned');
    await unbanPost(form({ postId: 'p1' }));

    expect(applyModeration).toHaveBeenCalledWith({
      postId: 'p1',
      action: 'unban',
      reason: null,
    });
    expect(revalidateSitemap).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith({
      adminId: 'a1',
      action: 'post.unban',
      targetType: 'post',
      targetId: 'p1',
    });
  });

  it('없는 게시글이면 오류', async () => {
    vi.mocked(applyModeration).mockResolvedValue('not_found');
    await expect(unbanPost(form({ postId: 'nope' }))).rejects.toThrow(
      'unknown_post',
    );
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});

describe('deletePost', () => {
  it('editor 는 거부 (실제 requireAdmin 경유)', async () => {
    await expect(deletePost(form({ postId: 'p1' }))).rejects.toThrow(
      'FORBIDDEN',
    );
    expect(dbState.deleteWheres).toHaveLength(0);
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(revalidateSitemap).not.toHaveBeenCalled();
  });

  it('admin 은 대상 게시글 행을 지우고 원래 초안을 draft 로 되돌림', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('admin'));
    await deletePost(form({ postId: 'p1' }));

    expect(paramsOf(dbState.deleteWheres[0])).toEqual(['p1']);
    expect(dbState.updates).toHaveLength(1);
    expect(dbState.updates[0].values).toEqual({ status: 'draft' });
    // 초안은 게시글이 가리키던 draftId 만 건드림
    expect(paramsOf(dbState.updates[0].where)).toEqual(['d1']);
    expect(dbState.order).toEqual(['delete', 'update']);
    expect(revalidateSitemap).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith(`/ko/admin/${KEY}/posts`);
  });

  it('기록에는 제목만 남기고 본문은 넣지 않음', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('admin'));
    await deletePost(form({ postId: 'p1' }));

    expect(logAdminAction).toHaveBeenCalledWith({
      adminId: 'a1',
      action: 'post.delete',
      targetType: 'post',
      targetId: 'p1',
      detail: { title: '제목' },
    });
  });

  it('없는 게시글이면 오류 (초안·사이트맵·기록 모두 건드리지 않음)', async () => {
    vi.mocked(getAdminSession).mockResolvedValue(session('admin'));
    dbState.deletedRows = [];
    await expect(deletePost(form({ postId: 'nope' }))).rejects.toThrow(
      'unknown_post',
    );
    expect(dbState.updates).toHaveLength(0);
    expect(revalidateSitemap).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
