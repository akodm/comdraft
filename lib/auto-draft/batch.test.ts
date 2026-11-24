import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));

import {
  compareStatusToResult,
  getFirstParentChain,
  getOwnSkipReason,
  getSkipReason,
  resolveFirstParentRange,
  selectBatch,
  selectFirstParentBatch,
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
    committerLogin: 'dev',
    ...overrides,
  };
}

const none = { excludedShas: new Set<string>(), emptyShas: new Set<string>() };

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

  it('20개 미만이면 끝까지 본 것', () => {
    const { exhausted } = selectBatch([commit(1), commit(2)], none);
    expect(exhausted).toBe(true);
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
    const { batchShas, skipped, exhausted } = selectBatch([], none);
    expect(batchShas).toEqual([]);
    expect(skipped.size).toBe(0);
    expect(exhausted).toBe(true);
  });
});

// 오래된 순 compare 목록을 만들 때 쓰는 커밋 (부모를 직접 지정)
const node = (
  sha: string,
  parentShas: string[],
  overrides: Partial<BranchCommit> = {},
): BranchCommit => ({
  sha,
  parentShas,
  message: sha,
  committerLogin: 'dev',
  ...overrides,
});

describe('getFirstParentChain', () => {
  it('끝 커밋에서 첫 부모를 따라 경계까지, 오래된 순으로 돌려줌', () => {
    const commits = [node('c1', ['b']), node('c2', ['c1']), node('c3', ['c2'])];
    expect(getFirstParentChain(commits, 'b', 'c3')?.map((c) => c.sha)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('머지로 들어온 커밋(두 번째 부모 쪽)은 사슬에 없음', () => {
    // B → C1 → M(C1, F1) → T, F1 은 C1 보다 오래됨
    const commits = [
      node('f1', ['b']),
      node('c1', ['b']),
      node('m', ['c1', 'f1']),
      node('t', ['m']),
    ];
    expect(getFirstParentChain(commits, 'b', 't')?.map((c) => c.sha)).toEqual([
      'c1',
      'm',
      't',
    ]);
  });

  it('끝이 경계와 같으면 빈 사슬', () => {
    expect(getFirstParentChain([], 'b', 'b')).toEqual([]);
  });

  it('경계에 닿기 전에 compare 목록을 벗어나면 null', () => {
    // 경계 b 가 두 번째 부모 쪽에만 있음: 첫 부모 사슬은 a 로 빠져나감
    const commits = [node('m', ['a', 'b']), node('t', ['m'])];
    expect(getFirstParentChain(commits, 'b', 't')).toBeNull();
  });

  it('부모가 없는 커밋에 닿으면 null', () => {
    expect(getFirstParentChain([node('r', [])], 'b', 'r')).toBeNull();
  });

  it('끝 커밋이 목록에 없으면 null', () => {
    expect(getFirstParentChain([node('c1', ['b'])], 'b', 'zz')).toBeNull();
  });
});

// compare 목록 → 첫 부모 범위 → 묶음 (실행기·스튜디오와 같은 순서)
const plan = (
  commits: BranchCommit[],
  boundarySha: string,
  headSha: string,
  sets: SkipSets = none,
  triggerShas?: readonly string[],
) =>
  selectFirstParentBatch(
    resolveFirstParentRange(commits, boundarySha, headSha, triggerShas),
    sets,
  );

describe('resolveFirstParentRange', () => {
  it('후보 없이 부르면(스튜디오) 끝은 브랜치 끝, 사슬 밖 커밋은 side', () => {
    const commits = [
      node('f1', ['b']),
      node('c1', ['b']),
      node('m', ['c1', 'f1']),
    ];
    const range = resolveFirstParentRange(commits, 'b', 'm');
    expect(range).toMatchObject({
      status: 'ok',
      endSha: 'm',
      sideShas: ['f1'],
    });
    if (range.status !== 'ok') throw new Error();
    expect(range.chain.map((c) => c.sha)).toEqual(['c1', 'm']);
  });

  it('후보가 모두 머지로 들어온 커밋이면 trigger_not_on_branch', () => {
    const commits = [
      node('c1', ['b']),
      node('f1', ['b'], { message: '[comdraft]' }),
      node('m', ['c1', 'f1']),
    ];
    expect(resolveFirstParentRange(commits, 'b', 'm', ['f1'])).toEqual({
      status: 'trigger_not_on_branch',
    });
  });

  it('사슬 위 후보 중 가장 최신 것에서 사슬을 자름 (후보 순서와 무관)', () => {
    const commits = [
      node('t1', ['b'], { message: '[comdraft] short' }),
      node('c2', ['t1']),
      node('t2', ['c2'], { message: '[comdraft] long' }),
      node('c3', ['t2']),
    ];
    const range = resolveFirstParentRange(commits, 'b', 'c3', ['t1', 't2']);
    expect(range).toMatchObject({ status: 'ok', endSha: 't2' });
    if (range.status !== 'ok') throw new Error();
    expect(range.chain.map((c) => c.sha)).toEqual(['t1', 'c2', 't2']);
  });

  it('사슬이 경계에 닿지 않으면 후보가 있어도 anchor_missing', () => {
    const commits = [
      node('m', ['a', 'b']),
      node('t', ['m'], { message: '[comdraft]' }),
    ];
    expect(resolveFirstParentRange(commits, 'b', 't', ['t'])).toEqual({
      status: 'anchor_missing',
    });
  });
});

describe('selectFirstParentBatch', () => {
  it('머지로 들어온 커밋은 side, 머지 커밋은 merge 로 건너뜀', () => {
    const commits = [
      node('f1', ['b']),
      node('c1', ['b']),
      node('m', ['c1', 'f1']),
      node('t', ['m'], { message: '[comdraft]' }),
    ];
    expect(plan(commits, 'b', 't')).toEqual({
      status: 'ok',
      endSha: 't',
      batchShas: ['c1', 't'],
      skipped: new Map([
        ['f1', 'side'],
        ['m', 'merge'],
      ]),
      exhausted: true,
    });
  });

  it('범위 판정이 ok 가 아니면 그대로 돌려줌', () => {
    expect(
      selectFirstParentBatch({ status: 'trigger_not_on_branch' }, none),
    ).toEqual({ status: 'trigger_not_on_branch' });
    expect(selectFirstParentBatch({ status: 'anchor_missing' }, none)).toEqual({
      status: 'anchor_missing',
    });
  });

  it('직접 올린 트리거 뒤에 같은 푸시로 머지가 오면 묶음은 트리거까지, 들어온 커밋은 side', () => {
    // b → t([comdraft]) → m(t, f1), f1 은 머지로 들어온 [comdraft] 커밋
    const commits = [
      node('t', ['b'], { message: '[comdraft]' }),
      node('f1', ['b'], { message: '[comdraft] long' }),
      node('m', ['t', 'f1']),
    ];
    expect(plan(commits, 'b', 'm', none, ['f1', 't'])).toEqual({
      status: 'ok',
      endSha: 't',
      batchShas: ['t'],
      skipped: new Map([['f1', 'side']]),
      exhausted: true,
    });
  });

  it('직접 올린 후보가 둘이면 사슬에서 가장 최신 것이 끝 커밋', () => {
    const commits = [
      node('c1', ['b']),
      node('t1', ['c1'], { message: '[comdraft] short' }),
      node('c2', ['t1']),
      node('t2', ['c2'], { message: '[comdraft] long' }),
    ];
    expect(plan(commits, 'b', 't2', none, ['t2', 't1'])).toMatchObject({
      status: 'ok',
      endSha: 't2',
      batchShas: ['c1', 't1', 'c2', 't2'],
      exhausted: true,
    });
  });

  it('PR 머지의 [comdraft] 는 실행하지 않고, 다음 직접 트리거가 사슬 커밋만 씀', () => {
    // main: b → c1, PR: f1([comdraft]) → m(c1, f1) 로 머지
    const merged = [
      node('c1', ['b']),
      node('f1', ['b'], { message: '[comdraft]' }),
      node('m', ['c1', 'f1']),
    ];
    expect(plan(merged, 'b', 'm', none, ['f1'])).toEqual({
      status: 'trigger_not_on_branch',
    });

    // 경계는 b 그대로, main 에 직접 t([comdraft]) 를 올림
    const first = plan(
      [...merged, node('t', ['m'], { message: '[comdraft]' })],
      'b',
      't',
      none,
      ['t'],
    );
    expect(first).toEqual({
      status: 'ok',
      endSha: 't',
      batchShas: ['c1', 't'],
      skipped: new Map([
        ['f1', 'side'],
        ['m', 'merge'],
      ]),
      exhausted: true,
    });

    // 경계 t 이후: 다시 쓰는 커밋 없음
    const next = plan(
      [node('c4', ['t']), node('t2', ['c4'], { message: '[comdraft]' })],
      't',
      't2',
      none,
      ['t2'],
    );
    expect(next).toMatchObject({ status: 'ok', batchShas: ['c4', 't2'] });
  });

  it('끝까지 본 뒤 끝 커밋을 경계로 삼으면 다음 실행에서 다시 쓰지 않음', () => {
    const first = plan(
      [
        node('f1', ['b']),
        node('c1', ['b']),
        node('m', ['c1', 'f1']),
        node('t', ['m'], { message: '[comdraft]' }),
      ],
      'b',
      't',
    );
    expect(first).toMatchObject({ status: 'ok', exhausted: true });

    // 다음 push: 경계 t 이후의 compare 목록 (t 의 조상은 들어오지 않음)
    const next = plan(
      [
        node('f2', ['t']),
        node('c4', ['t']),
        node('m2', ['c4', 'f2']),
        node('t2', ['m2'], { message: '[comdraft]' }),
      ],
      't',
      't2',
    );
    expect(next).toMatchObject({ status: 'ok', batchShas: ['c4', 't2'] });
    if (first.status !== 'ok' || next.status !== 'ok') throw new Error();
    expect(
      next.batchShas.filter((sha) => first.batchShas.includes(sha)),
    ).toEqual([]);
  });

  it('사슬에서 20개가 차면 끝까지 보지 않은 것', () => {
    const commits = Array.from({ length: 22 }, (_, i) =>
      node(`c${i + 1}`, [i === 0 ? 'b' : `c${i}`]),
    );
    const result = plan(commits, 'b', 'c22');
    expect(result).toMatchObject({ status: 'ok', exhausted: false });
    if (result.status !== 'ok') throw new Error();
    expect(result.batchShas).toHaveLength(20);
    expect(result.batchShas.at(-1)).toBe('c20');
  });

  it('사슬이 경계에 닿지 않으면 anchor_missing', () => {
    const commits = [node('m', ['a', 'b']), node('t', ['m'])];
    expect(plan(commits, 'b', 't')).toEqual({ status: 'anchor_missing' });
  });

  it('사슬 커밋에는 기존 건너뛰기 규칙(web-flow·제외·빈 트리거)을 그대로 적용', () => {
    const commits = [
      node('c1', ['b'], { committerLogin: 'web-flow' }),
      node('c2', ['c1']),
      node('c3', ['c2'], { message: '[comdraft]' }),
    ];
    const result = plan(commits, 'b', 'c3', {
      excludedShas: new Set(['c2']),
      emptyShas: new Set(['c3']),
    });
    expect(result).toEqual({
      status: 'ok',
      endSha: 'c3',
      batchShas: [],
      skipped: new Map([
        ['c1', 'github'],
        ['c2', 'excluded'],
        ['c3', 'empty_trigger'],
      ]),
      exhausted: true,
    });
  });
});

describe('getOwnSkipReason', () => {
  it('커밋 자체 정보만으로 머지·web-flow 를 판정', () => {
    expect(
      getOwnSkipReason({ parentShas: ['a', 'b'], committerLogin: 'dev' }),
    ).toBe('merge');
    expect(
      getOwnSkipReason({ parentShas: ['a'], committerLogin: 'web-flow' }),
    ).toBe('github');
    expect(
      getOwnSkipReason({ parentShas: ['a'], committerLogin: null }),
    ).toBeNull();
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
