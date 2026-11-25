import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));

import type { SkipReason } from '@/lib/auto-draft/batch';
import { getCommitMarkers, isCollectable } from '@/lib/auto-draft/markers';

const base = { sha: 'a', parentShas: ['p'], committerLogin: 'dev' };
const state = {
  anchorSha: 'a',
  batchShas: ['a', 'b'],
  skipped: new Map<string, SkipReason>(),
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

  it('범위 안에서는 서버가 계산한 사유(merge·github·side)로 수집 안 됨을 정한다', () => {
    const excluded = new Map([['s', 'user' as const]]);
    const skipped = new Map<string, SkipReason>([
      ['m', 'merge'],
      ['w', 'github'],
      // 머지로 들어온 커밋: 커밋 자체는 평범해 보여도 수집 안 됨
      ['s', 'side'],
    ]);

    for (const sha of ['m', 'w', 's']) {
      expect(
        getCommitMarkers({ ...base, sha }, { ...state, skipped, excluded }),
      ).toEqual([{ kind: 'not_collected' }]);
    }
  });

  it('범위 안의 빈 트리거·제외는 수집 안 됨이 아니다', () => {
    const skipped = new Map<string, SkipReason>([
      ['e', 'empty_trigger'],
      ['x', 'excluded'],
    ]);
    const excluded = new Map([['x', 'user' as const]]);

    expect(
      getCommitMarkers({ ...base, sha: 'e' }, { ...state, skipped }),
    ).toEqual([]);
    expect(
      getCommitMarkers({ ...base, sha: 'x' }, { ...state, skipped, excluded }),
    ).toEqual([{ kind: 'excluded', reason: 'user' }]);
  });

  it('범위 밖이면 커밋 자체 정보로 머지·web-flow 를 수집 안 됨으로 본다', () => {
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
  it('범위 밖은 머지·web-flow 가 아니면 수집 대상이다', () => {
    expect(isCollectable({ ...base, sha: 'z' }, state)).toBe(true);
    expect(
      isCollectable({ ...base, sha: 'z', parentShas: ['p', 'q'] }, state),
    ).toBe(false);
    expect(
      isCollectable({ ...base, sha: 'z', committerLogin: 'web-flow' }, state),
    ).toBe(false);
  });

  it('범위 안은 서버 사유를 따른다', () => {
    const skipped = new Map<string, SkipReason>([['s', 'side']]);

    expect(isCollectable({ ...base, sha: 's' }, { ...state, skipped })).toBe(
      false,
    );
    expect(isCollectable(base, { ...state, skipped })).toBe(true);
  });
});
