import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auto-draft/github', () => ({}));

import type { BranchCommit } from '@/lib/auto-draft/batch';
import { computeAutoDraftBatch } from '@/lib/auto-draft/batch-server';

const repo = { installationId: 1, owner: 'o', name: 'n', branch: 'main' };

const node = (
  sha: string,
  parentShas: string[],
  message = sha,
): BranchCommit => ({ sha, parentShas, message, committerLogin: 'dev' });

const makeIo = (commits: BranchCommit[], empty: string[] = []) => ({
  compare: vi.fn(async () => ({ status: 'ok' as const, commits })),
  findEmptyCommits: vi.fn(async () => new Set(empty)),
});

// 스튜디오처럼 브랜치 끝까지, 트리거 후보 없이
const plainInput = { boundarySha: 'b', headSha: 't', excluded: new Map() };

describe('computeAutoDraftBatch', () => {
  it('빈 트리거 확인은 첫 부모 사슬의 트리거 커밋에만', async () => {
    const io = makeIo(
      [
        node('f1', ['b'], '[comdraft] 옆 가지'),
        node('c1', ['b'], '[comdraft]'),
        node('m', ['c1', 'f1']),
        node('t', ['m'], '[comdraft] short'),
      ],
      ['c1'],
    );
    const result = await computeAutoDraftBatch(
      repo,
      { boundarySha: 'b', headSha: 't', excluded: new Map() },
      io,
    );
    expect(io.compare).toHaveBeenCalledWith(repo, 'b', 't');
    expect(io.findEmptyCommits).toHaveBeenCalledWith(repo, ['c1', 't']);
    expect(result).toEqual({
      status: 'ok',
      endSha: 't',
      batchShas: ['t'],
      skipped: new Map([
        ['f1', 'side'],
        ['c1', 'empty_trigger'],
        ['m', 'merge'],
      ]),
      exhausted: true,
    });
  });

  it('트리거 커밋이 없으면 빈 커밋 확인을 부르지 않음, 제외 목록을 반영', async () => {
    const io = makeIo([node('c1', ['b']), node('c2', ['c1'])]);
    const result = await computeAutoDraftBatch(
      repo,
      { boundarySha: 'b', headSha: 'c2', excluded: new Map([['c1', 'user']]) },
      io,
    );
    expect(io.findEmptyCommits).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'ok', batchShas: ['c2'] });
  });

  it('compare 가 anchor_missing 이면 그대로', async () => {
    const io = {
      compare: vi.fn(async () => ({ status: 'anchor_missing' as const })),
      findEmptyCommits: vi.fn(async () => new Set<string>()),
    };
    expect(await computeAutoDraftBatch(repo, plainInput, io)).toEqual({
      status: 'anchor_missing',
    });
    expect(io.findEmptyCommits).not.toHaveBeenCalled();
  });

  it('첫 부모 사슬이 경계에 닿지 않으면 anchor_missing', async () => {
    const io = makeIo([node('m', ['a', 'b']), node('t', ['m'], '[comdraft]')]);
    expect(
      await computeAutoDraftBatch(
        repo,
        { ...plainInput, triggerShas: ['t'] },
        io,
      ),
    ).toEqual({ status: 'anchor_missing' });
    expect(io.findEmptyCommits).not.toHaveBeenCalled();
  });

  it('트리거 후보가 있으면 compare 는 푸시 끝까지 한 번, 빈 커밋 확인은 고른 트리거까지만', async () => {
    // b → t0([comdraft], 이전 푸시) → c1 → t1([comdraft]) → m(t1, f1) → c3
    // f1 은 머지로 들어온 [comdraft], 이번 푸시의 후보는 f1·t1
    const io = makeIo([
      node('t0', ['b'], '[comdraft]'),
      node('c1', ['t0']),
      node('t1', ['c1'], '[comdraft] long'),
      node('f1', ['b'], '[comdraft]'),
      node('m', ['t1', 'f1']),
      node('c3', ['m']),
    ]);
    const result = await computeAutoDraftBatch(
      repo,
      {
        boundarySha: 'b',
        headSha: 'c3',
        excluded: new Map(),
        triggerShas: ['f1', 't1'],
      },
      io,
    );
    expect(io.compare).toHaveBeenCalledTimes(1);
    expect(io.compare).toHaveBeenCalledWith(repo, 'b', 'c3');
    expect(io.findEmptyCommits).toHaveBeenCalledWith(repo, ['t0', 't1']);
    expect(result).toEqual({
      status: 'ok',
      endSha: 't1',
      batchShas: ['t0', 'c1', 't1'],
      skipped: new Map([['f1', 'side']]),
      exhausted: true,
    });
  });

  it('트리거 후보가 모두 머지로 들어왔으면 trigger_not_on_branch, 빈 커밋 확인 안 함', async () => {
    const io = makeIo([
      node('c1', ['b']),
      node('f1', ['b'], '[comdraft]'),
      node('m', ['c1', 'f1']),
    ]);
    expect(
      await computeAutoDraftBatch(
        repo,
        {
          boundarySha: 'b',
          headSha: 'm',
          excluded: new Map(),
          triggerShas: ['f1'],
        },
        io,
      ),
    ).toEqual({ status: 'trigger_not_on_branch' });
    expect(io.findEmptyCommits).not.toHaveBeenCalled();
  });
});
