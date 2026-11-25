import { describe, expect, it } from 'vitest';
import {
  toBranchCommit,
  collectComparePages,
} from '@/lib/auto-draft/commit-walk';
import type { BranchCommit } from '@/lib/auto-draft/batch';

const commit = (sha: string): BranchCommit => ({
  sha,
  parentShas: [],
  message: sha,
});

describe('toBranchCommit', () => {
  it('SHA·부모·메시지만 변환한다', () => {
    expect(
      toBranchCommit({
        sha: 'a',
        parents: [{ sha: 'p1' }, { sha: 'p2' }],
        commit: { message: 'msg' },
      }),
    ).toEqual({
      sha: 'a',
      parentShas: ['p1', 'p2'],
      message: 'msg',
    });
  });
});

describe('collectComparePages', () => {
  const pages = [[commit('c'), commit('d')], [commit('e')]];
  const fetchPage = async (page: number) => pages[page - 2] ?? [];

  it('total 만큼 모일 때까지 다음 페이지를 이어 붙인다', async () => {
    const result = await collectComparePages(
      [commit('a'), commit('b')],
      5,
      fetchPage,
    );

    expect(result?.map((c) => c.sha)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('이미 다 모였으면 추가 요청 없이 반환', async () => {
    const result = await collectComparePages([commit('a')], 1, async () => {
      throw new Error('호출되면 안 됨');
    });

    expect(result).toHaveLength(1);
  });

  it('빈 페이지가 오면 null', async () => {
    expect(await collectComparePages([commit('a')], 9, fetchPage)).toBeNull();
  });

  it('최대 페이지를 넘으면 null', async () => {
    expect(
      await collectComparePages([commit('a'), commit('b')], 5, fetchPage, 2),
    ).toBeNull();
  });
});
