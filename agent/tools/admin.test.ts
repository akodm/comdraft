import { describe, expect, it, vi } from 'vitest';
import type { AdminRole } from '@/lib/db/schema/admin';

// 도구 파일은 서버 액션·조회 함수를 가져오므로, 실행되지 않는 서버 모듈은 비워 둠 (여기서는 권한 배치만 확인)
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));

const { adminTools } = await import('@/agent/tools/admin');

const visibleTo = (role: AdminRole) =>
  Object.entries(adminTools)
    .filter(
      ([, tool]) =>
        tool.options.access?.({ id: 'a1', loginId: 'x', role }) ?? false,
    )
    .map(([name]) => name)
    .sort();

const VIEW_TOOLS = [
  'getAiGenerationState',
  'getAiPrompt',
  'getDashboard',
  'getPost',
  'getPostViews',
  'getPromptHistory',
  'getUser',
  'listAiPrompts',
  'listPosts',
  'listPromptHistory',
  'listUsers',
];

const EDITOR_TOOLS = [
  'banPost',
  'banUser',
  'changeUserPlan',
  'resetAiPrompt',
  'resetUserUsage',
  'restoreAiPromptRevision',
  'revokeUserSessions',
  'saveAiPrompt',
  'unbanPost',
  'unbanUser',
];

const ADMIN_ONLY_TOOLS = [
  'deletePost',
  'hidePromptHistory',
  'pauseAiGeneration',
  'resumeAiGeneration',
];

describe('어드민 도구 권한 배치', () => {
  it('guest 에게는 아무 도구도 보이지 않는다', () => {
    expect(visibleTo('guest')).toEqual([]);
  });

  it('viewer 는 조회 도구만 본다', () => {
    expect(visibleTo('viewer')).toEqual(VIEW_TOOLS);
  });

  it('editor 는 조회와 중요하지 않은 조치까지 본다', () => {
    expect(visibleTo('editor')).toEqual(
      [...VIEW_TOOLS, ...EDITOR_TOOLS].sort(),
    );
  });

  it('admin 은 모든 도구를 본다', () => {
    expect(visibleTo('admin')).toEqual(
      [...VIEW_TOOLS, ...EDITOR_TOOLS, ...ADMIN_ONLY_TOOLS].sort(),
    );
  });

  it('모든 도구에 권한(access)이 있다', () => {
    const missing = Object.entries(adminTools)
      .filter(([, tool]) => !tool.options.access)
      .map(([name]) => name);

    expect(missing).toEqual([]);
  });

  it('데이터를 바꾸는 도구는 모두 승인(confirm)을 받는다', () => {
    const unconfirmed = [...EDITOR_TOOLS, ...ADMIN_ONLY_TOOLS].filter(
      (name) => !adminTools[name as keyof typeof adminTools].options.confirm,
    );

    expect(unconfirmed).toEqual([]);
  });

  it('조회 도구는 승인 없이 바로 실행된다', () => {
    const confirmed = VIEW_TOOLS.filter(
      (name) => adminTools[name as keyof typeof adminTools].options.confirm,
    );

    expect(confirmed).toEqual([]);
  });
});
