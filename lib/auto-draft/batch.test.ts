import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));

import {
  compareStatusToResult,
  getSkipReason,
  isEmptyTriggerCandidate,
  isMergeCommit,
  selectBatch,
  type BranchCommit,
  type SkipSets,
} from '@/lib/auto-draft/batch';

function commit(
  n: number,
  overrides: Partial<BranchCommit> = {},
): BranchCommit {
  return {
    sha: `sha${n}`,
    parentShas: [`sha${n - 1}`],
    message: `커밋 ${n}`,
    ...overrides,
  };
}

// 부모를 직접 지정하는 커밋 (compare 목록 순서 그대로 넘김)
const node = (
  sha: string,
  parentShas: string[],
  message = sha,
): BranchCommit => ({ sha, parentShas, message });

const none: SkipSets = {
  excludedShas: new Set<string>(),
  consumedShas: new Set<string>(),
  emptyShas: new Set<string>(),
};

const sets = (over: Partial<Record<keyof SkipSets, string[]>>): SkipSets => ({
  excludedShas: new Set(over.excludedShas ?? []),
  consumedShas: new Set(over.consumedShas ?? []),
  emptyShas: new Set(over.emptyShas ?? []),
});

describe('selectBatch', () => {
  it('20개에서 멈춤: 앞 20개를 순서대로 담고 나머지는 건너뛴 목록에도 넣지 않음', () => {
    const commits = Array.from({ length: 25 }, (_, i) => commit(i + 1));
    const { batchShas, skipped, exhausted } = selectBatch(commits, none);
    expect(batchShas).toEqual(commits.slice(0, 20).map((c) => c.sha));
    expect(skipped.size).toBe(0);
    expect(exhausted).toBe(false);
  });

  it('스무 번째 대상이 마지막 커밋이면 끝까지 본 것', () => {
    const commits = Array.from({ length: 20 }, (_, i) => commit(i + 1));
    const { batchShas, exhausted } = selectBatch(commits, none);
    expect(batchShas).toHaveLength(20);
    expect(exhausted).toBe(true);
  });

  it('20개 뒤에 건너뛸 커밋(머지·제외)만 남으면 끝까지 본 것', () => {
    const commits = [
      ...Array.from({ length: 20 }, (_, i) => commit(i + 1)),
      commit(21),
      commit(22, { parentShas: ['sha20', 'sha21'] }),
    ];
    const { batchShas, skipped, exhausted } = selectBatch(
      commits,
      sets({ excludedShas: ['sha21'] }),
    );
    expect(batchShas).toHaveLength(20);
    expect(exhausted).toBe(true);
    expect(skipped.get('sha21')).toBe('excluded');
    expect(skipped.get('sha22')).toBe('merge');
  });

  it('20개 뒤에 건너뛸 커밋 다음 대상이 하나라도 있으면 끝까지 보지 않은 것', () => {
    const commits = [
      ...Array.from({ length: 20 }, (_, i) => commit(i + 1)),
      commit(21, { parentShas: ['sha20', 'x'] }),
      commit(22),
    ];
    const { batchShas, exhausted } = selectBatch(commits, none);
    expect(batchShas).toHaveLength(20);
    expect(batchShas).not.toContain('sha22');
    expect(exhausted).toBe(false);
  });

  it('20개 미만이면 끝까지 본 것', () => {
    const { exhausted } = selectBatch([commit(1), commit(2)], none);
    expect(exhausted).toBe(true);
  });

  it('PR 머지 커밋 흐름: 머지로 들어온 PR 커밋도 compare 순서대로 대상, 머지 커밋만 건너뜀', () => {
    // main: b → c1, PR: f1 → f2([comdraft]) 를 m(c1, f2) 로 머지
    const commits = [
      node('f1', ['b']),
      node('c1', ['b']),
      node('f2', ['f1'], '[comdraft] long'),
      node('m', ['c1', 'f2']),
    ];
    expect(selectBatch(commits, none)).toEqual({
      batchShas: ['f1', 'c1', 'f2'],
      skipped: new Map([['m', 'merge']]),
      exhausted: true,
    });
  });

  it('squash 머지 흐름: GitHub 가 만든 squash 커밋(부모 하나, 제목 [comdraft] PR 제목)도 대상', () => {
    const commits = [
      node('c1', ['b']),
      node('s', ['c1'], '[comdraft] PR 제목'),
    ];
    expect(selectBatch(commits, none)).toEqual({
      batchShas: ['c1', 's'],
      skipped: new Map(),
      exhausted: true,
    });
  });

  it('이미 자동 초안에 쓴 커밋(consumed)은 건너뛰고 20개 수에 넣지 않음', () => {
    const commits = Array.from({ length: 25 }, (_, i) => commit(i + 1));
    const consumedShas = commits.slice(0, 5).map((c) => c.sha);
    const { batchShas, skipped, exhausted } = selectBatch(
      commits,
      sets({ consumedShas }),
    );
    expect(batchShas).toEqual(commits.slice(5, 25).map((c) => c.sha));
    expect(exhausted).toBe(true);
    for (const sha of consumedShas) expect(skipped.get(sha)).toBe('consumed');
  });

  it('제외는 수에 넣지 않음: 머지·제외·사용됨 커밋을 빼고 20개', () => {
    const commits = Array.from({ length: 30 }, (_, i) => {
      const n = i + 1;
      if (n === 2) return commit(n, { parentShas: ['a', 'b'] });
      return commit(n);
    });
    const { batchShas, skipped } = selectBatch(
      commits,
      sets({ excludedShas: ['sha6'], consumedShas: ['sha4'] }),
    );
    expect(batchShas).toHaveLength(20);
    expect(batchShas).not.toContain('sha2');
    expect(batchShas).not.toContain('sha4');
    expect(batchShas).not.toContain('sha6');
    expect(batchShas[0]).toBe('sha1');
    expect(skipped.get('sha2')).toBe('merge');
    expect(skipped.get('sha4')).toBe('consumed');
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
    const { batchShas, skipped } = selectBatch(
      commits,
      sets({ emptyShas: ['sha1'] }),
    );
    expect(batchShas).toEqual(['sha2']);
    expect(skipped.get('sha1')).toBe('empty_trigger');
  });

  it('빈 배열 → 빈 결과', () => {
    const { batchShas, skipped, exhausted } = selectBatch([], none);
    expect(batchShas).toEqual([]);
    expect(skipped.size).toBe(0);
    expect(exhausted).toBe(true);
  });
});

describe('isMergeCommit', () => {
  it('부모가 둘 이상이면 머지 커밋', () => {
    expect(isMergeCommit({ parentShas: ['a', 'b'] })).toBe(true);
    expect(isMergeCommit({ parentShas: ['a'] })).toBe(false);
    expect(isMergeCommit({ parentShas: [] })).toBe(false);
  });
});

describe('isEmptyTriggerCandidate', () => {
  it('제목이 트리거이고 부모가 하나인 커밋만 빈 커밋 확인 대상', () => {
    expect(isEmptyTriggerCandidate(node('t', ['a'], '[comdraft] short'))).toBe(
      true,
    );
    // 제목을 [comdraft] 로 바꾼 머지 커밋은 이미 merge 로 건너뜀
    expect(isEmptyTriggerCandidate(node('m', ['a', 'b'], '[comdraft]'))).toBe(
      false,
    );
    expect(isEmptyTriggerCandidate(node('c', ['a'], 'feat: x'))).toBe(false);
  });
});

describe('getSkipReason', () => {
  it('여러 사유가 겹치면 merge → excluded → consumed → empty_trigger 순', () => {
    const c = commit(1, { parentShas: ['a', 'b'], message: '[comdraft]' });
    const all = sets({
      excludedShas: ['sha1'],
      consumedShas: ['sha1'],
      emptyShas: ['sha1'],
    });
    expect(getSkipReason(c, all)).toBe('merge');
    const single = { ...c, parentShas: ['a'] };
    expect(getSkipReason(single, all)).toBe('excluded');
    expect(
      getSkipReason(single, { ...all, excludedShas: new Set<string>() }),
    ).toBe('consumed');
    expect(getSkipReason(single, sets({ emptyShas: ['sha1'] }))).toBe(
      'empty_trigger',
    );
  });

  it('트리거가 아닌 커밋은 emptyShas 에 있어도 건너뛰지 않음', () => {
    expect(getSkipReason(commit(1), sets({ emptyShas: ['sha1'] }))).toBeNull();
  });
});

describe('compareStatusToResult', () => {
  it('ahead 는 ok', () => {
    expect(compareStatusToResult('ahead')).toBe('ok');
  });

  it('identical·behind 는 커밋 없음(empty)', () => {
    expect(compareStatusToResult('identical')).toBe('empty');
    expect(compareStatusToResult('behind')).toBe('empty');
  });

  it('diverged·null(404) 은 anchor_missing', () => {
    expect(compareStatusToResult('diverged')).toBe('anchor_missing');
    expect(compareStatusToResult(null)).toBe('anchor_missing');
  });
});
