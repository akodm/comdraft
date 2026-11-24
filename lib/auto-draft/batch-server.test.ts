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
    const result = await computeAutoDraftBatch(repo, 'b', 't', new Map(), io);
    expect(io.compare).toHaveBeenCalledWith(repo, 'b', 't');
    expect(io.findEmptyCommits).toHaveBeenCalledWith(repo, ['c1', 't']);
    expect(result).toEqual({
      status: 'ok',
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
      'b',
      'c2',
      new Map([['c1', 'user']]),
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
    expect(await computeAutoDraftBatch(repo, 'b', 't', new Map(), io)).toEqual({
      status: 'anchor_missing',
    });
    expect(io.findEmptyCommits).not.toHaveBeenCalled();
  });

  it('첫 부모 사슬이 경계에 닿지 않으면 anchor_missing', async () => {
    const io = makeIo([node('m', ['a', 'b']), node('t', ['m'], '[comdraft]')]);
    expect(await computeAutoDraftBatch(repo, 'b', 't', new Map(), io)).toEqual({
      status: 'anchor_missing',
    });
    expect(io.findEmptyCommits).not.toHaveBeenCalled();
  });
});
