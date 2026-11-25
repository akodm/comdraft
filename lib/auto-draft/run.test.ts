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
});

// 트리거 하나인 푸시 (끝 SHA 기본값은 트리거 자신)
const push = (
  sha: string,
  options: TriggerOptions = {},
  headSha: string = sha,
): TriggerPush => ({ headSha, trigger: { sha, options } });

// 부모를 직접 지정하는 커밋
const node = (
  sha: string,
  parentShas: string[],
  message = sha,
): BranchCommit => ({ sha, parentShas, message });

const makeDeps = (over: Partial<RunDeps> = {}) => {
  const deps = {
    compare: vi.fn(async () => ({
      status: 'ok' as const,
      commits: [commit(1), commit(2), commit(3, '[comdraft]')],
    })),
    findEmptyCommits: vi.fn(async () => new Set<string>()),
    findConsumedShas: vi.fn(async () => new Set<string>()),
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

  it('compare 가 anchor_missing(diverged·404) 이면 anchor_missing, 경계는 그대로', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({ status: 'anchor_missing' as const })),
    });
    const out = await runAutoDraft(target(), push('c3'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'anchor_missing' });
    expect(deps.moveBoundary).not.toHaveBeenCalled();
  });

  it('compare 에 커밋이 없으면(identical·behind) no_commits, 트리거 SHA 로 기록', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({ status: 'ok' as const, commits: [] })),
    });
    const out = await runAutoDraft(target(), push('c3'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'no_commits' });
    expect(deps.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'no_commits', triggerSha: 'c3' }),
    );
    expect(deps.moveBoundary).not.toHaveBeenCalled();
    expect(deps.createDraftJob).not.toHaveBeenCalled();
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

  it('정상: compare(경계, 푸시 끝), 최신순 commitShas, 끝까지 봤으면 경계 → 푸시 끝, 러너 시작', async () => {
    // 같은 푸시에서 트리거(c3) 뒤에 c4·c5 가 와도 모두 이번 묶음
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [
          commit(1),
          commit(2),
          commit(3, '[comdraft] friendly'),
          commit(4),
          commit(5),
        ],
      })),
    });
    const out = await runAutoDraft(
      target(),
      push('c3', { tone: 'friendly' }, 'c5'),
      deps,
    );
    expect(out).toEqual({ status: 'started', jobId: 'j1' });
    expect(deps.compare).toHaveBeenCalledWith(expect.anything(), OLD, 'c5');
    expect(deps.moveBoundary).toHaveBeenCalledTimes(1);
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'c5');
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({
        prompt: '프리셋',
        commitShas: ['c5', 'c4', 'c3', 'c2', 'c1'],
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

  it('빈 트리거 확인은 트리거 커밋에만, 빈 트리거는 묶음에서 빠지고 경계는 푸시 끝', async () => {
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
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'c3');
  });

  it('PR 머지 커밋 흐름: PR 안의 [comdraft] 로 실행, PR 커밋도 묶음, 머지 커밋은 빠짐', async () => {
    // main: c0 → c1, PR: f1 → f2([comdraft] long) 를 m(c1, f2) 로 머지
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [
          node('f1', [OLD]),
          commit(1),
          node('f2', ['f1'], '[comdraft] long'),
          node('m', ['c1', 'f2']),
        ],
      })),
    });
    const out = await runAutoDraft(
      target(),
      push('f2', { length: 'long' }, 'm'),
      deps,
    );
    expect(out).toEqual({ status: 'started', jobId: 'j1' });
    expect(deps.compare).toHaveBeenCalledWith(expect.anything(), OLD, 'm');
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({
        commitShas: ['f2', 'c1', 'f1'],
        triggerSha: 'f2',
        options: expect.objectContaining({ length: 'long' }),
      }),
      'en',
    );
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'm');
  });

  it('squash 머지 흐름: GitHub 가 만든 squash 커밋이 대상이자 트리거', async () => {
    const deps = makeDeps({
      compare: vi.fn(async () => ({
        status: 'ok' as const,
        commits: [commit(1), commit(2, '[comdraft] lecture PR 제목 (#3)')],
      })),
    });
    const out = await runAutoDraft(
      target(),
      push('c2', { postType: 'lecture' }),
      deps,
    );
    expect(out).toEqual({ status: 'started', jobId: 'j1' });
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({
        commitShas: ['c2', 'c1'],
        triggerSha: 'c2',
        options: expect.objectContaining({ postType: 'lecture' }),
      }),
      'en',
    );
    expect(deps.moveBoundary).toHaveBeenCalledWith('u1', 'r1', OLD, 'c2');
  });

  it('이미 자동 초안에 쓴 커밋은 이 사용자·저장소로 조회해 묶음에서 뺌', async () => {
    const deps = makeDeps({
      findConsumedShas: vi.fn(async () => new Set(['c1'])),
    });
    await runAutoDraft(target(), push('c3'), deps);
    expect(deps.findConsumedShas).toHaveBeenCalledWith('u1', 'r1', [
      'c1',
      'c2',
      'c3',
    ]);
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({ commitShas: ['c3', 'c2'] }),
      'en',
    );
  });

  // 25개 커밋, c25 가 트리거
  const capped = () => {
    const commits = Array.from({ length: 25 }, (_, i) =>
      commit(i + 1, i === 24 ? '[comdraft]' : undefined),
    );
    return vi.fn(async () => ({ status: 'ok' as const, commits }));
  };

  it('20개에서 잘리면 경계를 옮기지 않고 작업을 만듦', async () => {
    const deps = makeDeps({ compare: capped() });
    const out = await runAutoDraft(target(), push('c25'), deps);
    expect(out).toEqual({ status: 'started', jobId: 'j1' });
    expect(deps.moveBoundary).not.toHaveBeenCalled();
    expect(deps.createDraftJob).toHaveBeenCalledWith(
      'u1',
      'r1',
      expect.objectContaining({
        commitShas: Array.from({ length: 20 }, (_, i) => `c${20 - i}`),
        triggerSha: 'c25',
      }),
      'en',
    );
  });

  it('20개에서 잘린 뒤 작업을 못 만들면 실패 기록만, 경계는 건드리지 않음', async () => {
    const deps = makeDeps({
      compare: capped(),
      createDraftJob: vi.fn(async () => ({ status: 'rate_limited' as const })),
    });
    const out = await runAutoDraft(target(), push('c25'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'rate_limited' });
    expect(deps.moveBoundary).not.toHaveBeenCalled();
  });

  it('20개에서 잘린 뒤 실행기를 시작하지 못하면 작업 실패 처리, 경계는 건드리지 않음', async () => {
    const deps = makeDeps({
      compare: capped(),
      startRunner: vi.fn(async () => {
        throw new Error('down');
      }),
    });
    const out = await runAutoDraft(target(), push('c25'), deps);
    expect(out).toEqual({ status: 'skipped', errorCode: 'runner_unavailable' });
    expect(deps.failJob).toHaveBeenCalledWith('j1', 'runner_unavailable');
    expect(deps.moveBoundary).not.toHaveBeenCalled();
  });

  it('20개에서 잘린 뒤 createDraftJob 이 던지면 원래 오류, 경계는 건드리지 않음', async () => {
    const deps = makeDeps({
      compare: capped(),
      createDraftJob: vi.fn(async () => {
        throw new Error('orig');
      }),
    });
    await expect(runAutoDraft(target(), push('c25'), deps)).rejects.toThrow(
      'orig',
    );
    expect(deps.moveBoundary).not.toHaveBeenCalled();
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
    const out = await runAutoDraft(target(), push('c3', {}, 'c3'), deps);
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

  // 웹훅 재전송 시뮬레이션: 작업 행·실패 행이 같은 (user, trigger_sha) 유일 인덱스를 나눠 씀
  const redeliveryDeps = (commits: BranchCommit[]) => {
    let boundary = OLD;
    const triggerShas = new Set<string>();
    const consumed = new Set<string>();
    const deps = makeDeps({
      compare: vi.fn(async (_repo: unknown, base: string, head: string) => {
        const from = commits.findIndex((c) => c.sha === base);
        const to = commits.findIndex((c) => c.sha === head);
        // 경계가 이미 푸시 끝이면 identical → 커밋 없음
        return {
          status: 'ok' as const,
          commits: base === head ? [] : commits.slice(from + 1, to + 1),
        };
      }),
      findConsumedShas: vi.fn(
        async (_u: string, _r: string, shas: string[]) =>
          new Set(shas.filter((sha) => consumed.has(sha))),
      ),
      moveBoundary: vi.fn(
        async (_u: string, _r: string, from: string | null, to: string) => {
          if (from !== boundary) return false;
          boundary = to;
          return true;
        },
      ),
      createDraftJob: vi.fn(
        async (
          _u: string,
          _r: string,
          request: { triggerSha: string | null; commitShas: string[] },
        ) => {
          if (triggerShas.has(request.triggerSha as string)) {
            return { status: 'duplicate' as const };
          }
          triggerShas.add(request.triggerSha as string);
          for (const sha of request.commitShas) consumed.add(sha);
          return { status: 'created' as const, draftId: 'd1', jobId: 'j1' };
        },
      ),
      recordFailure: vi.fn(async (record: { triggerSha: string }) =>
        triggerShas.has(record.triggerSha)
          ? ('duplicate' as const)
          : ('recorded' as const),
      ),
    });
    return { deps, getBoundary: () => boundary };
  };

  it('재전송(끝까지 본 뒤): 경계가 이미 푸시 끝이라 no_commits 행이 작업의 trigger_sha 와 충돌 → duplicate', async () => {
    const commits = [commit(0), commit(1), commit(2), commit(3, '[comdraft]')];
    const { deps, getBoundary } = redeliveryDeps(commits);

    expect(await runAutoDraft(target(), push('c3'), deps)).toEqual({
      status: 'started',
      jobId: 'j1',
    });
    expect(getBoundary()).toBe('c3');

    expect(
      await runAutoDraft(
        target({ boundarySha: getBoundary() }),
        push('c3'),
        deps,
      ),
    ).toEqual({ status: 'duplicate' });
    expect(deps.createDraftJob).toHaveBeenCalledTimes(1);
    expect(deps.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'no_commits', triggerSha: 'c3' }),
    );
  });

  it('재전송(20개에서 잘린 뒤): 경계는 그대로, 쓴 커밋은 사용됨으로 빠지고 같은 트리거라 duplicate', async () => {
    const commits = [
      commit(0),
      ...Array.from({ length: 25 }, (_, i) =>
        commit(i + 1, i === 24 ? '[comdraft]' : undefined),
      ),
    ];
    const { deps, getBoundary } = redeliveryDeps(commits);

    await runAutoDraft(target(), push('c25'), deps);
    expect(deps.moveBoundary).not.toHaveBeenCalled();
    expect(getBoundary()).toBe(OLD);

    expect(await runAutoDraft(target(), push('c25'), deps)).toEqual({
      status: 'duplicate',
    });
    // 두 번째 계산은 c21~c25 만 묶음으로 봄
    expect(deps.createDraftJob).toHaveBeenLastCalledWith(
      'u1',
      'r1',
      expect.objectContaining({
        commitShas: ['c25', 'c24', 'c23', 'c22', 'c21'],
      }),
      'en',
    );
    // 남은 커밋을 끝까지 봐서 선점했다가 duplicate 로 되돌림 → 경계는 그대로
    expect(getBoundary()).toBe(OLD);
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
