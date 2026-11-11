import { describe, expect, it } from 'vitest';
import {
  getBlankButtonState,
  getBlankFillLock,
} from '@/lib/studio/blank-fill-state';
import { MAX_BLANK_ANSWER_LENGTH } from '@/lib/generation/limits';

const BLANK_ID = '7b0c1e0e-3f5d-4a8e-9a43-2f2f0a6c1d11';

const job = (
  overrides: Partial<Parameters<typeof getBlankFillLock>[0] & object>,
) => ({
  kind: 'fill' as const,
  blankId: BLANK_ID,
  status: 'running' as const,
  applied: false,
  ...overrides,
});

describe('getBlankFillLock', () => {
  it('작업이 없으면 아무 빈칸도 막지 않는다', () => {
    expect(getBlankFillLock(null, null)).toEqual({
      fillingBlankId: null,
      isBusy: false,
    });
  });

  it('요청을 보내는 중인 빈칸은 작업이 생기기 전에도 막는다', () => {
    expect(getBlankFillLock(null, BLANK_ID)).toEqual({
      fillingBlankId: BLANK_ID,
      isBusy: true,
    });
  });

  it('진행 중이거나 아직 넣지 않은 빈칸 채우기는 그 빈칸을 막는다', () => {
    expect(getBlankFillLock(job({ status: 'queued' }), null)).toEqual({
      fillingBlankId: BLANK_ID,
      isBusy: true,
    });
    expect(getBlankFillLock(job({ status: 'completed' }), null)).toEqual({
      fillingBlankId: BLANK_ID,
      isBusy: true,
    });
  });

  it('실패했거나 넣은 빈칸 채우기는 잠금을 푼다', () => {
    const idle = { fillingBlankId: null, isBusy: false };

    expect(getBlankFillLock(job({ status: 'failed' }), null)).toEqual(idle);
    expect(
      getBlankFillLock(job({ status: 'completed', applied: true }), null),
    ).toEqual(idle);
  });

  it('AI 작성 중이면 빈칸은 막지 않고 다듬기만 막는다', () => {
    expect(
      getBlankFillLock(job({ kind: 'draft', blankId: null }), null),
    ).toEqual({ fillingBlankId: null, isBusy: true });
    expect(
      getBlankFillLock(
        job({
          kind: 'draft',
          blankId: null,
          status: 'completed',
          applied: true,
        }),
        null,
      ),
    ).toEqual({ fillingBlankId: null, isBusy: false });
  });
});

describe('getBlankButtonState', () => {
  const state = (
    overrides: Partial<Parameters<typeof getBlankButtonState>[0]>,
  ) =>
    getBlankButtonState({
      answer: '답',
      isEditable: true,
      isBusy: false,
      ...overrides,
    });

  it('답이 있고 편집할 수 있으면 세 버튼 모두 쓸 수 있다', () => {
    expect(state({})).toEqual({
      canFill: true,
      canInsert: true,
      canRemove: true,
      isTooLong: false,
    });
  });

  it('답이 비면(공백뿐) 다듬기와 그대로 넣기를 막고 지우기는 둔다', () => {
    expect(state({ answer: '  \n ' })).toEqual({
      canFill: false,
      canInsert: false,
      canRemove: true,
      isTooLong: false,
    });
  });

  it('답이 1,000자를 넘으면 다듬기만 막고 안내한다', () => {
    expect(
      state({ answer: '가'.repeat(MAX_BLANK_ANSWER_LENGTH) }).canFill,
    ).toBe(true);
    expect(state({ answer: '가'.repeat(MAX_BLANK_ANSWER_LENGTH + 1) })).toEqual(
      {
        canFill: false,
        canInsert: true,
        canRemove: true,
        isTooLong: true,
      },
    );
  });

  it('AI 작성 중이거나 다른 빈칸을 다듬는 중이면 다듬기만 막는다', () => {
    expect(state({ isBusy: true })).toEqual({
      canFill: false,
      canInsert: true,
      canRemove: true,
      isTooLong: false,
    });
  });

  it('편집 잠금 중에는 모두 막는다', () => {
    expect(state({ isEditable: false })).toEqual({
      canFill: false,
      canInsert: false,
      canRemove: false,
      isTooLong: false,
    });
  });
});
