import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));

import {
  compareStatusToResult,
  getSkipReason,
  selectBatch,
  type BranchCommit,
} from '@/lib/auto-draft/batch';

function commit(
  n: number,
  overrides: Partial<BranchCommit> = {},
): BranchCommit {
  return {
    sha: `sha${n}`,
    parentShas: [`sha${n - 1}`],
    message: `커밋 ${n}`,
    committerLogin: 'dev',
    ...overrides,
  };
}

const none = { excludedShas: new Set<string>(), emptyShas: new Set<string>() };

describe('selectBatch', () => {
  it('20개에서 멈춤: 앞 20개를 순서대로 담고 나머지는 건너뛴 목록에도 넣지 않음', () => {
    const commits = Array.from({ length: 25 }, (_, i) => commit(i + 1));
    const { batchShas, skipped } = selectBatch(commits, none);
    expect(batchShas).toEqual(commits.slice(0, 20).map((c) => c.sha));
    expect(skipped.size).toBe(0);
  });

  it('제외는 수에 넣지 않음: 머지·web-flow·제외 커밋을 빼고 20개', () => {
    const commits = Array.from({ length: 30 }, (_, i) => {
      const n = i + 1;
      if (n === 2) return commit(n, { parentShas: ['a', 'b'] });
      if (n === 4) return commit(n, { committerLogin: 'web-flow' });
      return commit(n);
    });
    const { batchShas, skipped } = selectBatch(commits, {
      excludedShas: new Set(['sha6']),
      emptyShas: new Set(),
    });
    expect(batchShas).toHaveLength(20);
    expect(batchShas).not.toContain('sha2');
    expect(batchShas).not.toContain('sha4');
    expect(batchShas).not.toContain('sha6');
    expect(batchShas[0]).toBe('sha1');
    expect(skipped.get('sha2')).toBe('merge');
    expect(skipped.get('sha4')).toBe('github');
    expect(skipped.get('sha6')).toBe('excluded');
    // 스무 번째 대상 이후는 다음 묶음 몫
    expect(batchShas[19]).toBe('sha23');
    expect(skipped.has('sha24')).toBe(false);
  });

  it('빈 트리거는 건너뛰고 변경 있는 트리거는 포함', () => {
    const commits = [
      commit(1, { message: '[comdraft]' }),
      commit(2, { message: '[comdraft] short' }),
    ];
    const { batchShas, skipped } = selectBatch(commits, {
      excludedShas: new Set(),
      emptyShas: new Set(['sha1']),
    });
    expect(batchShas).toEqual(['sha2']);
    expect(skipped.get('sha1')).toBe('empty_trigger');
  });

  it('빈 배열 → 빈 결과', () => {
    const { batchShas, skipped } = selectBatch([], none);
    expect(batchShas).toEqual([]);
    expect(skipped.size).toBe(0);
  });
});

describe('getSkipReason', () => {
  it('여러 사유가 겹치면 merge → github → excluded → empty_trigger 순', () => {
    const c = commit(1, {
      parentShas: ['a', 'b'],
      committerLogin: 'web-flow',
      message: '[comdraft]',
    });
    const sets = {
      excludedShas: new Set(['sha1']),
      emptyShas: new Set(['sha1']),
    };
    expect(getSkipReason(c, sets)).toBe('merge');
    expect(getSkipReason({ ...c, parentShas: ['a'] }, sets)).toBe('github');
    expect(
      getSkipReason({ ...c, parentShas: ['a'], committerLogin: 'dev' }, sets),
    ).toBe('excluded');
    expect(
      getSkipReason(
        { ...c, parentShas: ['a'], committerLogin: null },
        { ...sets, excludedShas: new Set() },
      ),
    ).toBe('empty_trigger');
  });

  it('트리거가 아닌 커밋은 emptyShas 에 있어도 건너뛰지 않음', () => {
    expect(
      getSkipReason(commit(1), {
        excludedShas: new Set(),
        emptyShas: new Set(['sha1']),
      }),
    ).toBeNull();
  });
});

describe('compareStatusToResult', () => {
  it('ahead·identical 은 ok', () => {
    expect(compareStatusToResult('ahead')).toBe('ok');
    expect(compareStatusToResult('identical')).toBe('ok');
  });

  it('behind·diverged·null(404) 은 anchor_missing', () => {
    expect(compareStatusToResult('behind')).toBe('anchor_missing');
    expect(compareStatusToResult('diverged')).toBe('anchor_missing');
    expect(compareStatusToResult(null)).toBe('anchor_missing');
  });
});
