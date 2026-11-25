import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));

import type { SkipReason } from '@/lib/auto-draft/batch';
import {
  getCommitMarkers,
  getCommitMenu,
  isCollectable,
} from '@/lib/auto-draft/markers';

const base = { sha: 'a', parentShas: ['p'] };
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

  it('범위 안의 PR 로 들어온 커밋(부모 하나)도 묶음에 있으면 자동 대상', () => {
    // b → f1(PR) → m(머지), 서버 계산 묶음 [c1, f1]
    const prState = {
      ...state,
      anchorSha: 'c1',
      batchShas: ['c1', 'f1'],
      skipped: new Map<string, SkipReason>([['m', 'merge']]),
    };
    expect(getCommitMarkers({ sha: 'f1', parentShas: ['b'] }, prState)).toEqual(
      [{ kind: 'auto', position: 2 }],
    );
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

  it('머지 커밋만 수집 안 됨 (범위 안은 서버 사유, 범위 밖은 부모 수)', () => {
    const skipped = new Map<string, SkipReason>([['m', 'merge']]);
    const excluded = new Map([['q', 'user' as const]]);

    expect(
      getCommitMarkers({ ...base, sha: 'm' }, { ...state, skipped }),
    ).toEqual([{ kind: 'not_collected' }]);
    expect(
      getCommitMarkers(
        { sha: 'q', parentShas: ['p', 'r'] },
        { ...state, excluded },
      ),
    ).toEqual([{ kind: 'not_collected' }]);
  });

  it('이미 자동 초안에 쓴 커밋은 이미 사용됨 표시', () => {
    const skipped = new Map<string, SkipReason>([['u', 'consumed']]);

    expect(
      getCommitMarkers({ ...base, sha: 'u' }, { ...state, skipped }),
    ).toEqual([{ kind: 'consumed' }]);
  });

  it('범위 안의 빈 트리거는 표시가 없고, 제외가 사용됨보다 먼저', () => {
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

  it('기준점이 없으면 기준점 표시도 없다', () => {
    expect(
      getCommitMarkers(base, { ...state, anchorSha: null, batchShas: [] }),
    ).toEqual([]);
  });
});

describe('isCollectable', () => {
  it('머지 커밋이 아니면 수집 대상이다', () => {
    expect(isCollectable({ ...base, sha: 'z' }, state)).toBe(true);
    expect(
      isCollectable({ ...base, sha: 'z', parentShas: ['p', 'q'] }, state),
    ).toBe(false);
  });

  it('범위 안은 서버 사유를 따른다', () => {
    const skipped = new Map<string, SkipReason>([
      ['m', 'merge'],
      ['u', 'consumed'],
    ]);

    expect(isCollectable({ ...base, sha: 'm' }, { ...state, skipped })).toBe(
      false,
    );
    expect(isCollectable({ ...base, sha: 'u' }, { ...state, skipped })).toBe(
      true,
    );
  });
});

describe('getCommitMenu', () => {
  it('머지 커밋에는 메뉴가 없다', () => {
    expect(getCommitMenu({ sha: 'm', parentShas: ['p', 'q'] }, state)).toBe(
      null,
    );
  });

  it('일반 커밋은 기준점과 제외, 제외한 커밋은 기준점과 제외 취소', () => {
    expect(getCommitMenu(base, state)).toEqual({ exclude: 'exclude' });
    expect(
      getCommitMenu(base, {
        ...state,
        excluded: new Map([['a', 'user' as const]]),
      }),
    ).toEqual({ exclude: 'restore' });
  });

  it('이미 사용된 커밋은 기준점만 (제외 없음)', () => {
    expect(
      getCommitMenu(base, {
        ...state,
        skipped: new Map<string, SkipReason>([['a', 'consumed']]),
      }),
    ).toEqual({ exclude: null });
  });
});
