import { describe, expect, it } from 'vitest';
import {
  groupPromptHistory,
  pickPageEntries,
  toUsagePercentLabel,
  type PromptHistoryItem,
} from '@/lib/studio/prompt-history';

const item = (
  id: string,
  draftId: string,
  kind: PromptHistoryItem['kind'],
  createdAt: string,
): PromptHistoryItem => ({
  id,
  draftId,
  kind,
  prompt: id,
  commitShas: [],
  status: 'completed',
  createdAt,
  usageRatio: 0,
});

describe('groupPromptHistory', () => {
  it('빈칸 채우기를 같은 초안의 바로 앞 초안 작성 요청 아래에 붙인다', () => {
    const items = [
      item('fill-2', 'd1', 'fill', '2026-11-12T05:00:00Z'),
      item('draft-2', 'd1', 'draft', '2026-11-12T04:00:00Z'),
      item('fill-1', 'd1', 'fill', '2026-11-12T03:00:00Z'),
      item('draft-1', 'd1', 'draft', '2026-11-12T02:00:00Z'),
    ];

    const entries = groupPromptHistory(items);

    expect(entries.map((entry) => entry.item.id)).toEqual([
      'draft-2',
      'draft-1',
    ]);
    expect(entries[0].fills.map((fill) => fill.id)).toEqual(['fill-2']);
    expect(entries[1].fills.map((fill) => fill.id)).toEqual(['fill-1']);
  });

  it('다른 초안의 작성 요청에는 붙이지 않는다', () => {
    const items = [
      item('fill-b', 'd2', 'fill', '2026-11-12T05:00:00Z'),
      item('draft-a', 'd1', 'draft', '2026-11-12T04:00:00Z'),
    ];

    const entries = groupPromptHistory(items);

    expect(entries.map((entry) => entry.item.id)).toEqual([
      'fill-b',
      'draft-a',
    ]);
    expect(entries[1].fills).toEqual([]);
  });

  it('붙일 작성 요청이 조회 범위 밖이면 단독 항목으로 남긴다', () => {
    const entries = groupPromptHistory([
      item('fill-1', 'd1', 'fill', '2026-11-12T05:00:00Z'),
    ]);

    expect(entries).toEqual([
      {
        item: item('fill-1', 'd1', 'fill', '2026-11-12T05:00:00Z'),
        fills: [],
      },
    ]);
  });

  it('한 작성 요청 아래 여러 빈칸 채우기는 최신순', () => {
    const entries = groupPromptHistory([
      item('fill-3', 'd1', 'fill', '2026-11-12T06:00:00Z'),
      item('fill-2', 'd1', 'fill', '2026-11-12T05:00:00Z'),
      item('draft-1', 'd1', 'draft', '2026-11-12T04:00:00Z'),
    ]);

    expect(entries[0].fills.map((fill) => fill.id)).toEqual([
      'fill-3',
      'fill-2',
    ]);
  });
});

describe('toUsagePercentLabel', () => {
  it('반올림한 정수 퍼센트', () => {
    expect(toUsagePercentLabel(0.052)).toEqual({ kind: 'percent', value: 5 });
    expect(toUsagePercentLabel(0.125)).toEqual({ kind: 'percent', value: 13 });
  });

  it('0 이면 0%, 1% 미만이면 under_one', () => {
    expect(toUsagePercentLabel(0)).toEqual({ kind: 'percent', value: 0 });
    expect(toUsagePercentLabel(0.004)).toEqual({ kind: 'under_one' });
  });

  it('1 을 넘으면 그대로 100 을 넘는다', () => {
    expect(toUsagePercentLabel(1.2)).toEqual({ kind: 'percent', value: 120 });
  });
});

describe('pickPageEntries', () => {
  it('이 페이지의 초안 작성 요청에 딸린 빈칸 채우기만 붙이고, 더 최신 요청의 빈칸 채우기는 뺀다', () => {
    const page = [
      item('draft-b1', 'd2', 'draft', '2026-11-12T03:00:00Z'),
      item('draft-a1', 'd1', 'draft', '2026-11-12T02:00:00Z'),
    ];
    // 앞 페이지에 나온 d1 의 새 요청과 그 빈칸 채우기, 이 페이지 요청의 빈칸 채우기
    const related = [
      item('fill-a2', 'd1', 'fill', '2026-11-12T06:00:00Z'),
      item('draft-a2', 'd1', 'draft', '2026-11-12T05:00:00Z'),
      item('fill-a1', 'd1', 'fill', '2026-11-12T04:00:00Z'),
      item('fill-b1', 'd2', 'fill', '2026-11-12T03:30:00Z'),
      ...page,
    ];

    const entries = pickPageEntries(page, related);

    expect(entries.map((entry) => entry.item.id)).toEqual([
      'draft-b1',
      'draft-a1',
    ]);
    expect(entries[0].fills.map((fill) => fill.id)).toEqual(['fill-b1']);
    expect(entries[1].fills.map((fill) => fill.id)).toEqual(['fill-a1']);
  });

  it('페이지가 비어 있으면 빈 목록', () => {
    expect(pickPageEntries([], [])).toEqual([]);
  });
});
