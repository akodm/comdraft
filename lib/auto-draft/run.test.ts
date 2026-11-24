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
import {
  recordUnexpectedFailure,
  runAutoDraft,
  type RunDeps,
} from '@/lib/auto-draft/run';
import type { PushTarget } from '@/lib/auto-draft/store';
import type { TriggerOptions } from '@/lib/auto-draft/trigger';
import type { TriggerPush } from '@/lib/auto-draft/webhook';
import { DEFAULT_PROMPT_OPTIONS } from '@/lib/studio/options';

// 경계 = 첫 커밋 c1 의 첫 부모
const OLD = 'c0';

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

// 트리거 후보 하나인 푸시 (끝 SHA 기본값은 후보 자신)
const push = (
  sha: string,
  options: TriggerOptions = {},
  headSha: string = sha,
): TriggerPush => ({ headSha, candidates: [{ sha, options }] });

// 부모를 직접 지정하는 커밋
const node = (
  sha: string,
  parentShas: string[],
  message = sha,
): BranchCommit => ({ sha, parentShas, message, committerLogin: 'dev' });

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
    const out = await runAutoDraft(target({ prompt: '  ' }), push('c3'), deps);
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
      push('c3'),
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
    const out = await runAutoDraft(target(), push('c3'), deps);
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
    const out = await runAutoDraft(target(), push('c3'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'github_reauth' });
  });

  it('허용되지 않는 모델이면 model_locked', async () => {
    const deps = makeDeps();
    const t = target({
      options: { ...DEFAULT_PROMPT_OPTIONS, model: 'opus' },
    });
    const out = await runAutoDraft(t, push('c3'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'model_locked' });
  });

  it('compare 가 anchor_missing 이면 anchor_missing', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({ status: 'anchor_missing' as const })),
    });
    const out = await runAutoDraft(target(), push('c3'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'anchor_missing' });
  });

  it('묶음이 비면 no_commits, 경계는 건드리지 않음', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [commit(1, '[comdraft]')],
      })),
      findEmptyCommits: vi.fn(async () => new Set(['c1'])),
    });
    const out = await runAutoDraft(target(), push('c1'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'no_commits' });
    expect(deps.moveBoundary).not.toHaveBeenCalled();
  });

  it('빈 트리거 확인은 트리거 커밋에만, 끝까지 봤으면 경계는 트리거 커밋으로', async () => {
    const deps = makeDeps({
      findEmptyCommits: vi.fn(async () => new Set(['c3'])),
    });
    const out = await runAutoDraft(target(), push('c3'), deps);
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
    // 묶음 마지막(c2)이 아니라 끝 커밋(c3)까지 옮겨 빈 트리거를 다시 보지 않음
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'c3');
  });

  it('20개에서 잘리면 경계는 묶음 마지막 커밋으로, 되돌릴 때도 같은 값', async () => {
    const commits = Array.from({ length: 25 }, (_, i) =>
      commit(i + 1, i === 24 ? '[comdraft]' : undefined),
    );
    const deps = makeDeps({
      compare: vi.fn(async () => ({ status: 'ok' as const, commits })),
      createDraftJob: vi.fn(async () => ({ status: 'rate_limited' as const })),
    });
    await runAutoDraft(target(), push('c25'), deps);
    expect(deps.moveBoundary).toHaveBeenNthCalledWith(
      1,
      'u1',
      'r1',
      OLD,
      'c20',
    );
    expect(deps.moveBoundary).toHaveBeenLastCalledWith('u1', 'r1', 'c20', OLD);
  });

  it('머지로 들어온 커밋은 묶음에 넣지 않음 (첫 부모 사슬만)', async () => {
    // c0 → c1 → m(c1, f1) → c3
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [
          { ...commit(9), sha: 'f1', parentShas: [OLD] },
          commit(1),
          { ...commit(2), sha: 'm', parentShas: ['c1', 'f1'] },
          { ...commit(3, '[comdraft]'), parentShas: ['m'] },
        ],
      })),
    });
    const out = await runAutoDraft(target(), push('c3'), deps);
    expect(out).toMatchObject({ status: 'started' });
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({ commitShas: ['c3', 'c1'] }),
      'en',
    );
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'c3');
  });

  it('첫 부모 사슬이 경계에 닿지 않으면 anchor_missing', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [{ ...commit(3, '[comdraft]'), parentShas: ['zz'] }],
      })),
    });
    const out = await runAutoDraft(target(), push('c3'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'anchor_missing' });
    expect(deps.moveBoundary).not.toHaveBeenCalled();
  });

  it('정상: 최신순 commitShas, 경계 선점 한 번, 러너 시작', async () => {
    const deps = makeDeps();
    const out = await runAutoDraft(
      target(),
      push('c3', { tone: 'friendly' }),
      deps,
    );
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
    const out = await runAutoDraft(target(), push('c3'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'no_commits' });
    expect(deps.createDraftJob).not.toHaveBeenCalled();
  });

  it('slot rate_limited 면 실패 기록 + 경계 되돌림', async () => {
    const deps = makeDeps({
      createDraftJob: vi.fn(async () => ({ status: 'rate_limited' as const })),
    });
    const out = await runAutoDraft(target(), push('c3'), deps);
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
    const out = await runAutoDraft(target(), push('c3'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'too_many_active' });
  });

  it('createDraftJob duplicate 면 duplicate, 러너 안 부르고 경계 되돌림', async () => {
    const deps = makeDeps({
      createDraftJob: vi.fn(async () => ({ status: 'duplicate' as const })),
    });
    const out = await runAutoDraft(target(), push('c3'), deps);
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
    const out = await runAutoDraft(target(), push('c3'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'runner_unavailable' });
    expect(deps.failJob).toHaveBeenCalledWith('j1', 'runner_unavailable');
    expect(deps.moveBoundary).toHaveBeenLastCalledWith('u1', 'r1', 'c3', OLD);
    expect(deps.recordFailure).not.toHaveBeenCalled();
  });

  it('failJob 이 실패해도 경계는 먼저 되돌림', async () => {
    const deps = makeDeps({
      startRunner: vi.fn(async () => {
        throw new Error('down');
      }),
      failJob: vi.fn(async () => {
        throw new Error('db');
      }),
    });
    await expect(runAutoDraft(target(), push('c3'), deps)).rejects.toThrow(
      'db',
    );
    expect(deps.moveBoundary).toHaveBeenLastCalledWith('u1', 'r1', 'c3', OLD);
  });

  it('createDraftJob 이 던지면 경계를 되돌리고 원래 오류를 던짐', async () => {
    const moveBoundary = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('revert'));
    const deps = makeDeps({
      moveBoundary,
      createDraftJob: vi.fn(async () => {
        throw new Error('orig');
      }),
    });
    await expect(runAutoDraft(target(), push('c3'), deps)).rejects.toThrow(
      'orig',
    );
    expect(moveBoundary).toHaveBeenLastCalledWith('u1', 'r1', 'c3', OLD);
  });

  it('20개에서 잘리면 트리거 뒤 커밋과 무관하게 경계는 묶음 마지막', async () => {
    const commits = Array.from({ length: 26 }, (_, i) =>
      commit(i + 1, i === 24 ? '[comdraft]' : undefined),
    );
    const deps = makeDeps({
      compare: vi.fn(async () => ({ status: 'ok' as const, commits })),
    });
    await runAutoDraft(target(), push('c25', {}, 'c26'), deps);
    expect(deps.compare).toHaveBeenCalledWith(expect.anything(), OLD, 'c26');
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'c20');
  });

  it('후보가 모두 머지로 들어온 커밋이면 trigger_not_on_branch, 경계는 그대로', async () => {
    // c0 → c1 → m(c1, f1), f1([comdraft]) 은 PR 로 들어옴
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [
          commit(1),
          node('f1', [OLD], '[comdraft] long'),
          node('m', ['c1', 'f1']),
        ],
      })),
    });
    const out = await runAutoDraft(
      target(),
      push('f1', { length: 'long' }, 'm'),
      deps,
    );
    expect(out).toEqual({
      status: 'skipped',
      errorCode: 'trigger_not_on_branch',
    });
    expect(deps.compare).toHaveBeenCalledTimes(1);
    expect(deps.compare).toHaveBeenCalledWith(expect.anything(), OLD, 'm');
    expect(deps.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'trigger_not_on_branch',
        triggerSha: 'f1',
        options: expect.objectContaining({ length: 'long' }),
      }),
    );
    expect(deps.findEmptyCommits).not.toHaveBeenCalled();
    expect(deps.moveBoundary).not.toHaveBeenCalled();
    expect(deps.createDraftJob).not.toHaveBeenCalled();
  });

  it('직접 올린 트리거 뒤에 머지가 오면 트리거 커밋이 끝, 옵션도 그 커밋 것', async () => {
    // c0 → t([comdraft] friendly) → m(t, f1), f1([comdraft] long) 은 머지로 들어옴
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [
          node('t', [OLD], '[comdraft] friendly'),
          node('f1', [OLD], '[comdraft] long'),
          node('m', ['t', 'f1']),
        ],
      })),
    });
    const out = await runAutoDraft(
      target(),
      {
        headSha: 'm',
        candidates: [
          { sha: 'f1', options: { length: 'long' } },
          { sha: 't', options: { tone: 'friendly' } },
        ],
      },
      deps,
    );
    expect(out).toEqual({ status: 'started', jobId: 'j1' });
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({
        commitShas: ['t'],
        triggerSha: 't',
        options: expect.objectContaining({
          tone: 'friendly',
          length: DEFAULT_PROMPT_OPTIONS.length,
        }),
      }),
      'en',
    );
    // 끝까지 봤어도 푸시 끝(m)이 아니라 트리거 커밋(t)까지만
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 't');
  });

  it('사슬 위 [comdraft] 가 squash 머지(web-flow) 커밋이면 trigger_not_on_branch, 경계는 그대로', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [
          commit(1),
          { ...commit(2, '[comdraft] long'), committerLogin: 'web-flow' },
        ],
      })),
    });
    const out = await runAutoDraft(
      target(),
      push('c2', { length: 'long' }),
      deps,
    );
    expect(out).toEqual({
      status: 'skipped',
      errorCode: 'trigger_not_on_branch',
    });
    expect(deps.moveBoundary).not.toHaveBeenCalled();
    expect(deps.createDraftJob).not.toHaveBeenCalled();
  });

  it('제목이 [comdraft] 인 머지 커밋은 trigger_not_on_branch', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [
          commit(1),
          node('f1', [OLD]),
          node('m', ['c1', 'f1'], '[comdraft]'),
        ],
      })),
    });
    const out = await runAutoDraft(target(), push('m'), deps);
    expect(out).toEqual({
      status: 'skipped',
      errorCode: 'trigger_not_on_branch',
    });
    expect(deps.moveBoundary).not.toHaveBeenCalled();
  });

  it('직접 올린 후보가 더 최신인 web-flow 후보보다 우선', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [
          commit(1, '[comdraft] friendly'),
          { ...commit(2, '[comdraft] long'), committerLogin: 'web-flow' },
        ],
      })),
    });
    await runAutoDraft(
      target(),
      {
        headSha: 'c2',
        candidates: [
          { sha: 'c2', options: { length: 'long' } },
          { sha: 'c1', options: { tone: 'friendly' } },
        ],
      },
      deps,
    );
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({
        commitShas: ['c1'],
        triggerSha: 'c1',
        options: expect.objectContaining({ tone: 'friendly' }),
      }),
      'en',
    );
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'c1');
  });

  it('직접 올린 후보가 둘이면 사슬에서 가장 최신 것', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [
          commit(1),
          commit(2, '[comdraft] short'),
          commit(3),
          commit(4, '[comdraft] long'),
        ],
      })),
    });
    await runAutoDraft(
      target(),
      {
        headSha: 'c4',
        candidates: [
          { sha: 'c4', options: { length: 'long' } },
          { sha: 'c2', options: { length: 'short' } },
        ],
      },
      deps,
    );
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({
        commitShas: ['c4', 'c3', 'c2', 'c1'],
        triggerSha: 'c4',
        options: expect.objectContaining({ length: 'long' }),
      }),
      'en',
    );
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'c4');
  });

  it('PR 머지의 [comdraft] 는 실행하지 않고, 다음 직접 트리거는 사슬 커밋만 쓰고 그다음 실행은 다시 쓰지 않음', async () => {
    // main: c0(B) → c1, PR: f1([comdraft]) → m(c1, f1) 로 머지, 그 뒤 main 에 직접 t([comdraft])
    const history = [
      commit(1),
      node('f1', [OLD], '[comdraft]'),
      node('m', ['c1', 'f1']),
      node('t', ['m'], '[comdraft]'),
      node('c4', ['t']),
      node('t2', ['c4'], '[comdraft]'),
    ];
    // compare(base, head): head 의 조상 중 base 의 조상이 아닌 커밋 (오래된 순)
    const ancestors = (sha: string): Set<string> => {
      const seen = new Set<string>();
      const stack = [sha];
      while (stack.length > 0) {
        const current = stack.pop() as string;
        const found = history.find((c) => c.sha === current);
        if (!found || seen.has(current)) continue;
        seen.add(current);
        stack.push(...found.parentShas);
      }
      return seen;
    };
    let boundary = OLD;
    const deps = makeDeps({
      compare: vi.fn(async (_repo: unknown, base: string, head: string) => {
        const exclude = ancestors(base);
        const inHead = ancestors(head);
        return {
          status: 'ok' as const,
          commits: history.filter(
            (c) => inHead.has(c.sha) && !exclude.has(c.sha),
          ),
        };
      }),
      moveBoundary: vi.fn(
        async (_u: string, _r: string, from: string | null, to: string) => {
          if (from !== boundary) return false;
          boundary = to;
          return true;
        },
      ),
    });

    // 1) PR 머지 푸시: 후보 f1 은 사슬 밖 → 실행 안 함
    expect(await runAutoDraft(target(), push('f1', {}, 'm'), deps)).toEqual({
      status: 'skipped',
      errorCode: 'trigger_not_on_branch',
    });
    expect(boundary).toBe(OLD);

    // 2) 직접 트리거 t: 묶음 [c1, t] (m 은 머지 커밋, f1 은 side), 경계 → t
    expect(
      await runAutoDraft(target({ boundarySha: boundary }), push('t'), deps),
    ).toMatchObject({ status: 'started' });
    expect(deps.createDraftJob).toHaveBeenLastCalledWith(
      'u1',
      'r1',
      expect.objectContaining({ commitShas: ['t', 'c1'], triggerSha: 't' }),
      'en',
    );
    expect(boundary).toBe('t');

    // 3) 경계 t 이후의 다음 트리거: 앞에서 쓴 커밋을 다시 쓰지 않음
    await runAutoDraft(target({ boundarySha: boundary }), push('t2'), deps);
    expect(deps.createDraftJob).toHaveBeenLastCalledWith(
      'u1',
      'r1',
      expect.objectContaining({ commitShas: ['t2', 'c4'], triggerSha: 't2' }),
      'en',
    );
    expect(boundary).toBe('t2');
  });

  it('실패 기록이 duplicate 이면 duplicate', async () => {
    const deps = makeDeps({
      recordFailure: vi.fn(async () => 'duplicate' as const),
    });
    const out = await runAutoDraft(target({ prompt: '' }), push('c3'), deps);
    expect(out).toEqual({ status: 'duplicate' });
  });
});

describe('recordUnexpectedFailure', () => {
  it('트리거 옵션을 합친 internal 실패 행을 남김', async () => {
    const deps = makeDeps();
    await recordUnexpectedFailure(
      target(),
      push('c3', { length: 'long' }),
      deps,
    );
    expect(deps.recordFailure).toHaveBeenCalledWith({
      userId: 'u1',
      repositoryId: 'r1',
      triggerSha: 'c3',
      errorCode: 'internal',
      prompt: '프리셋',
      options: expect.objectContaining({ length: 'long', model: 'haiku' }),
      locale: 'en',
    });
  });

  it('이미 같은 트리거 행이 있으면(duplicate) 조용히 끝냄', async () => {
    const deps = makeDeps({
      recordFailure: vi.fn(async () => 'duplicate' as const),
    });
    await expect(
      recordUnexpectedFailure(target(), push('c3'), deps),
    ).resolves.toBeUndefined();
  });
});
