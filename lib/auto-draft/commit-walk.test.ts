import { describe, expect, it } from 'vitest';
import { toBranchCommit, walkBackToBase } from '@/lib/auto-draft/commit-walk';
import type { BranchCommit } from '@/lib/auto-draft/batch';

const commit = (sha: string): BranchCommit => ({
  sha,
  parentShas: [],
  message: sha,
  committerLogin: null,
});

describe('toBranchCommit', () => {
  it('부모와 committer 를 변환한다', () => {
    expect(
      toBranchCommit({
        sha: 'a',
        parents: [{ sha: 'p1' }, { sha: 'p2' }],
        commit: { message: 'msg' },
        committer: { login: 'web-flow' },
      }),
    ).toEqual({
      sha: 'a',
      parentShas: ['p1', 'p2'],
      message: 'msg',
      committerLogin: 'web-flow',
    });
  });

  it('committer 가 없으면 null', () => {
    expect(
      toBranchCommit({ sha: 'a', parents: [], commit: { message: '' } })
        .committerLogin,
    ).toBeNull();
  });
});

describe('walkBackToBase', () => {
  const pages = [
    [commit('e'), commit('d')],
    [commit('c'), commit('b')],
    [commit('a')],
  ];
  const fetchPage = async (page: number) => pages[page - 1] ?? [];

  it('base 직전까지 오래된 순으로 모은다', async () => {
    const result = await walkBackToBase('b', fetchPage);

    expect(result?.map((c) => c.sha)).toEqual(['c', 'd', 'e']);
  });

  it('base 가 head 바로 아래면 빈 배열', async () => {
    expect(await walkBackToBase('e', fetchPage)).toEqual([]);
  });

  it('base 를 못 만나면 null', async () => {
    expect(await walkBackToBase('zzz', fetchPage)).toBeNull();
  });

  it('최대 페이지를 넘으면 null', async () => {
    expect(await walkBackToBase('a', fetchPage, 2)).toBeNull();
  });
});
