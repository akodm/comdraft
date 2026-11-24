import { describe, expect, it } from 'vitest';
import { getCommitMarkers, isCollectable } from '@/lib/auto-draft/markers';

const base = { sha: 'a', parentShas: ['p'], committerLogin: 'dev' };
const state = {
  anchorSha: 'a',
  batchShas: ['a', 'b'],
  excluded: new Map<string, 'user' | 'force_push'>(),
};

describe('getCommitMarkers', () => {
  it('기준점이면서 자동 대상인 커밋은 두 표시를 모두 받는다', () => {
    expect(getCommitMarkers(base, state)).toEqual([
      { kind: 'anchor' },
      { kind: 'auto', position: 1 },
    ]);
  });

  it('묶음 안 순번을 1부터 센다', () => {
    expect(getCommitMarkers({ ...base, sha: 'b' }, state)).toEqual([
      { kind: 'auto', position: 2 },
    ]);
  });

  it('묶음 밖 커밋은 표시가 없다', () => {
    expect(getCommitMarkers({ ...base, sha: 'z' }, state)).toEqual([]);
  });

  it('제외한 커밋은 사유별 표시를 받는다', () => {
    const excluded = new Map([
      ['u', 'user' as const],
      ['f', 'force_push' as const],
    ]);

    expect(
      getCommitMarkers({ ...base, sha: 'u' }, { ...state, excluded }),
    ).toEqual([{ kind: 'excluded', reason: 'user' }]);
    expect(
      getCommitMarkers({ ...base, sha: 'f' }, { ...state, excluded }),
    ).toEqual([{ kind: 'excluded', reason: 'force_push' }]);
  });

  it('머지 커밋과 web-flow 커밋은 수집 안 됨 하나만 받는다', () => {
    const excluded = new Map([['m', 'user' as const]]);

    expect(
      getCommitMarkers(
        { sha: 'm', parentShas: ['p', 'q'], committerLogin: 'dev' },
        { ...state, excluded },
      ),
    ).toEqual([{ kind: 'not_collected' }]);
    expect(
      getCommitMarkers(
        { sha: 'w', parentShas: ['p'], committerLogin: 'web-flow' },
        state,
      ),
    ).toEqual([{ kind: 'not_collected' }]);
  });

  it('기준점이 없으면 기준점 표시도 없다', () => {
    expect(
      getCommitMarkers(base, { ...state, anchorSha: null, batchShas: [] }),
    ).toEqual([]);
  });
});

describe('isCollectable', () => {
  it('머지·web-flow 가 아니면 수집 대상이다', () => {
    expect(isCollectable(base)).toBe(true);
    expect(isCollectable({ ...base, parentShas: ['p', 'q'] })).toBe(false);
    expect(isCollectable({ ...base, committerLogin: 'web-flow' })).toBe(false);
  });
});
