import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auto-draft/github', () => ({}));
vi.mock('@/lib/auto-draft/store', () => ({}));

import type { BranchCommit } from '@/lib/auto-draft/batch';
import { computeAutoDraftBatch } from '@/lib/auto-draft/batch-server';

const repo = { installationId: 1, owner: 'o', name: 'n', branch: 'main' };

const node = (
  sha: string,
  parentShas: string[],
  message = sha,
): BranchCommit => ({ sha, parentShas, message });

const makeIo = (
  commits: BranchCommit[],
  { empty = [], consumed = [] }: { empty?: string[]; consumed?: string[] } = {},
) => ({
  compare: vi.fn(async () => ({ status: 'ok' as const, commits })),
  findEmptyCommits: vi.fn(async () => new Set(empty)),
  findConsumedShas: vi.fn(async () => new Set(consumed)),
});

const input = {
  userId: 'u1',
  repositoryId: 'r1',
  boundarySha: 'b',
  endSha: 'm',
  excluded: new Map(),
};

describe('computeAutoDraftBatch', () => {
  it('compare(경계, 끝) 한 번, PR 로 들어온 커밋도 대상, 머지 커밋은 건너뜀', async () => {
    // main: b → c1, PR: f1 → f2([comdraft]) 를 m(c1, f2) 로 머지
    const io = makeIo([
      node('f1', ['b']),
      node('c1', ['b']),
      node('f2', ['f1'], '[comdraft] long'),
      node('m', ['c1', 'f2']),
    ]);
    const result = await computeAutoDraftBatch(repo, input, io);
    expect(io.compare).toHaveBeenCalledTimes(1);
    expect(io.compare).toHaveBeenCalledWith(repo, 'b', 'm');
    expect(result).toEqual({
      status: 'ok',
      batchShas: ['f1', 'c1', 'f2'],
      skipped: new Map([['m', 'merge']]),
      exhausted: true,
    });
  });

  it('빈 커밋 확인은 제목이 트리거이고 부모가 하나인 커밋에만', async () => {
    const io = makeIo(
      [
        node('c1', ['b'], '[comdraft]'),
        node('f1', ['b'], '[comdraft] short'),
        node('m', ['c1', 'f1'], '[comdraft] 병합 제목'),
        node('c2', ['m']),
      ],
      { empty: ['c1'] },
    );
    const result = await computeAutoDraftBatch(
      repo,
      { ...input, endSha: 'c2' },
      io,
    );
    expect(io.findEmptyCommits).toHaveBeenCalledWith(repo, ['c1', 'f1']);
    expect(result).toEqual({
      status: 'ok',
      batchShas: ['f1', 'c2'],
      skipped: new Map([
        ['c1', 'empty_trigger'],
        ['m', 'merge'],
      ]),
      exhausted: true,
    });
  });

  it('이 사용자·저장소의 사용됨 커밋을 범위 SHA 로 조회해 건너뜀, 제외 목록도 반영', async () => {
    const io = makeIo(
      [node('c1', ['b']), node('c2', ['c1']), node('c3', ['c2'])],
      { consumed: ['c1'] },
    );
    const result = await computeAutoDraftBatch(
      repo,
      { ...input, endSha: 'c3', excluded: new Map([['c2', 'user']]) },
      io,
    );
    expect(io.findConsumedShas).toHaveBeenCalledWith('u1', 'r1', [
      'c1',
      'c2',
      'c3',
    ]);
    expect(io.findEmptyCommits).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ok',
      batchShas: ['c3'],
      skipped: new Map([
        ['c1', 'consumed'],
        ['c2', 'excluded'],
      ]),
      exhausted: true,
    });
  });

  it('compare 결과에 커밋이 없으면(identical·behind) 조회 없이 빈 묶음', async () => {
    const io = makeIo([]);
    expect(await computeAutoDraftBatch(repo, input, io)).toEqual({
      status: 'ok',
      batchShas: [],
      skipped: new Map(),
      exhausted: true,
    });
    expect(io.findEmptyCommits).not.toHaveBeenCalled();
    expect(io.findConsumedShas).not.toHaveBeenCalled();
  });

  it('compare 가 anchor_missing(diverged·404) 이면 그대로', async () => {
    const io = {
      ...makeIo([]),
      compare: vi.fn(async () => ({ status: 'anchor_missing' as const })),
    };
    expect(await computeAutoDraftBatch(repo, input, io)).toEqual({
      status: 'anchor_missing',
    });
    expect(io.findEmptyCommits).not.toHaveBeenCalled();
    expect(io.findConsumedShas).not.toHaveBeenCalled();
  });
});
