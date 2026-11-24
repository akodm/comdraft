import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auto-draft/github', () => ({}));
vi.mock('@/lib/auto-draft/store', () => ({}));
vi.mock('@/lib/generation/draft-job', () => ({}));
vi.mock('@/lib/generation/jobs', () => ({}));
vi.mock('@/lib/generation/get-runner', () => ({}));

import type { BranchCommit } from '@/lib/auto-draft/batch';
import { runAutoDraft, type RunDeps } from '@/lib/auto-draft/run';
import type { PushTarget } from '@/lib/auto-draft/store';
import { DEFAULT_PROMPT_OPTIONS } from '@/lib/studio/options';

const OLD = 'base0';

const target = (over: Partial<PushTarget['setting']> = {}): PushTarget => ({
  userId: 'u1',
  repositoryId: 'r1',
  githubAccountId: '1',
  user: { id: 'u1', role: 'basic', bannedAt: null },
  repo: { installationId: 1, owner: 'o', name: 'n', branch: 'main' },
  setting: {
    prompt: '프리셋',
    options: { ...DEFAULT_PROMPT_OPTIONS, model: 'haiku' },
    boundarySha: OLD,
    ...over,
  },
});

const commit = (n: number, message = `커밋 ${n}`): BranchCommit => ({
  sha: `c${n}`,
  parentShas: [`c${n - 1}`],
  message,
  committerLogin: 'dev',
});

const makeDeps = (over: Partial<RunDeps> = {}) => {
  const deps = {
    compare: vi.fn(async () => ({
      status: 'ok' as const,
      commits: [commit(1), commit(2), commit(3, '[comdraft]')],
    })),
    findEmptyCommits: vi.fn(async () => new Set<string>()),
    listExcludedShas: vi.fn(async () => new Map()),
    gate: vi.fn(async () => ({ status: 'ok' as const, githubToken: 'tok' })),
    createDraftJob: vi.fn(async () => ({
      status: 'created' as const,
      draftId: 'd1',
      jobId: 'j1',
    })),
    startRunner: vi.fn(async () => {}),
    failJob: vi.fn(async () => null),
    recordFailure: vi.fn(async () => 'recorded' as const),
    moveBoundary: vi.fn(async () => true),
    getLocale: vi.fn(async () => 'en' as const),
    ...over,
  };
  return deps as typeof deps & RunDeps;
};

describe('runAutoDraft', () => {
  it('프리셋이 비면 no_preset', async () => {
    const deps = makeDeps();
    const out = await runAutoDraft(target({ prompt: '  ' }), 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'no_preset' });
    expect(deps.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'no_preset', triggerSha: 'c3' }),
    );
    expect(deps.gate).not.toHaveBeenCalled();
  });

  it('경계가 null 이면 anchor_missing', async () => {
    const deps = makeDeps();
    const out = await runAutoDraft(
      target({ boundarySha: null }),
      'c3',
      {},
      deps,
    );
    expect(out).toEqual({ status: 'skipped', errorCode: 'anchor_missing' });
    expect(deps.compare).not.toHaveBeenCalled();
  });

  it('gate quota 소진은 quota_exceeded 로 매핑, 헤더는 null', async () => {
    const deps = makeDeps({
      gate: vi.fn(async () => ({
        status: 'quota_exhausted' as const,
        resetsAt: 'x',
      })),
    });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'quota_exceeded' });
    expect(deps.gate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      null,
    );
  });

  it('gate 의 다른 상태는 같은 이름의 코드', async () => {
    const deps = makeDeps({
      gate: vi.fn(async () => ({ status: 'github_reauth' as const })),
    });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'github_reauth' });
  });

  it('허용되지 않는 모델이면 model_locked', async () => {
    const deps = makeDeps();
    const t = target({
      options: { ...DEFAULT_PROMPT_OPTIONS, model: 'opus' },
    });
    const out = await runAutoDraft(t, 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'model_locked' });
  });

  it('compare 가 anchor_missing 이면 anchor_missing', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({ status: 'anchor_missing' as const })),
    });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'anchor_missing' });
  });

  it('묶음이 비면 no_commits, 경계는 건드리지 않음', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({ status: 'ok' as const, commits: [] })),
    });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'no_commits' });
    expect(deps.moveBoundary).not.toHaveBeenCalled();
  });

  it('빈 트리거 확인은 트리거 커밋에만', async () => {
    const deps = makeDeps({
      findEmptyCommits: vi.fn(async () => new Set(['c3'])),
    });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(deps.findEmptyCommits).toHaveBeenCalledWith(expect.anything(), [
      'c3',
    ]);
    expect(out).toMatchObject({ status: 'started' });
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({ commitShas: ['c2', 'c1'] }),
      'en',
    );
  });

  it('정상: 최신순 commitShas, 경계 선점 한 번, 러너 시작', async () => {
    const deps = makeDeps();
    const out = await runAutoDraft(target(), 'c3', { tone: 'friendly' }, deps);
    expect(out).toEqual({ status: 'started', jobId: 'j1' });
    expect(deps.moveBoundary).toHaveBeenCalledTimes(1);
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'c3');
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({
        prompt: '프리셋',
        commitShas: ['c3', 'c2', 'c1'],
        codeInputs: [],
        referenceUrls: [],
        draftId: null,
        source: 'commit_trigger',
        triggerSha: 'c3',
        options: expect.objectContaining({ tone: 'friendly' }),
      }),
      'en',
    );
    expect(deps.startRunner).toHaveBeenCalledWith({
      jobId: 'j1',
      githubToken: 'tok',
    });
    expect(deps.recordFailure).not.toHaveBeenCalled();
  });

  it('선점 CAS 가 실패하면 no_commits, 작업을 만들지 않음', async () => {
    const deps = makeDeps({ moveBoundary: vi.fn(async () => false) });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'no_commits' });
    expect(deps.createDraftJob).not.toHaveBeenCalled();
  });

  it('slot rate_limited 면 실패 기록 + 경계 되돌림', async () => {
    const deps = makeDeps({
      createDraftJob: vi.fn(async () => ({ status: 'rate_limited' as const })),
    });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'rate_limited' });
    expect(deps.moveBoundary).toHaveBeenLastCalledWith('u1', 'r1', 'c3', OLD);
    expect(deps.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'rate_limited' }),
    );
  });

  it('busy 는 too_many_active', async () => {
    const deps = makeDeps({
      createDraftJob: vi.fn(async () => ({ status: 'busy' as const })),
    });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'too_many_active' });
  });

  it('createDraftJob duplicate 면 duplicate, 러너 안 부르고 경계 되돌림', async () => {
    const deps = makeDeps({
      createDraftJob: vi.fn(async () => ({ status: 'duplicate' as const })),
    });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(out).toEqual({ status: 'duplicate' });
    expect(deps.startRunner).not.toHaveBeenCalled();
    expect(deps.moveBoundary).toHaveBeenLastCalledWith('u1', 'r1', 'c3', OLD);
    expect(deps.recordFailure).not.toHaveBeenCalled();
  });

  it('runner 실패면 작업 실패 처리, 경계 되돌림, 실패 행은 따로 안 만듦', async () => {
    const deps = makeDeps({
      startRunner: vi.fn(async () => {
        throw new Error('down');
      }),
    });
    const out = await runAutoDraft(target(), 'c3', {}, deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'runner_unavailable' });
    expect(deps.failJob).toHaveBeenCalledWith('j1', 'runner_unavailable');
    expect(deps.moveBoundary).toHaveBeenLastCalledWith('u1', 'r1', 'c3', OLD);
    expect(deps.recordFailure).not.toHaveBeenCalled();
  });

  it('실패 기록이 duplicate 이면 duplicate', async () => {
    const deps = makeDeps({
      recordFailure: vi.fn(async () => 'duplicate' as const),
    });
    const out = await runAutoDraft(target({ prompt: '' }), 'c3', {}, deps);
    expect(out).toEqual({ status: 'duplicate' });
  });
});
