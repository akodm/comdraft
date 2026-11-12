import type {
  GenerationJobKind,
  GenerationStatus,
} from '@/lib/generation/contract';

/**
 * 저장소 설정의 프롬프트 내역 (순수 함수, 서버/클라이언트 공용)
 */

// 내역 한 줄 (요청 문구, 사용한 커밋, 주간 제공량 대비 사용 비율)
export interface PromptHistoryItem {
  id: string;
  draftId: string;
  kind: GenerationJobKind;
  // 초안 작성은 요청 문구, 빈칸 채우기는 작성자가 적은 답
  prompt: string;
  commitShas: string[];
  status: GenerationStatus;
  // ISO
  createdAt: string;
  // 주간 제공량 대비 이 요청이 쓴 비율 (0 이상, 1 을 넘을 수 있음, 등급 정책이 없으면 null)
  usageRatio: number | null;
}

// 초안 작성 요청과 그 뒤에 이어 보낸 빈칸 채우기 요청들 (빈칸 채우기만 남은 경우 단독 항목)
export interface PromptHistoryEntry {
  item: PromptHistoryItem;
  fills: PromptHistoryItem[];
}

// 프롬프트 내역 한 페이지의 초안 작성 요청 수 (처음 5개, 이후 무한 스크롤로 5개씩)
export const PROMPT_HISTORY_PAGE_SIZE = 5;

/**
 * 최신순 내역을 초안 작성 요청 단위로 묶음
 * - 빈칸 채우기는 같은 초안에서 그보다 먼저 보낸 가장 가까운 초안 작성 요청 아래에 붙임
 * - 붙일 곳이 없으면(그 초안 작성 요청이 조회 범위 밖이거나 없음) 단독 항목으로 둠
 * - 순서는 입력 순서(최신순)를 유지
 */
export const groupPromptHistory = (
  items: PromptHistoryItem[],
): PromptHistoryEntry[] => {
  const time = (item: PromptHistoryItem) => new Date(item.createdAt).getTime();
  const draftJobs = items.filter((item) => item.kind === 'draft');
  const fillsByParent = new Map<string, PromptHistoryItem[]>();
  const orphanFillIds = new Set<string>();

  for (const item of items) {
    if (item.kind !== 'fill') {
      continue;
    }

    // 입력이 최신순이라 처음 만나는, 이 요청보다 이른 같은 초안의 작성 요청이 가장 가까움
    const parent = draftJobs.find(
      (job) => job.draftId === item.draftId && time(job) <= time(item),
    );

    if (parent) {
      fillsByParent.set(parent.id, [
        ...(fillsByParent.get(parent.id) ?? []),
        item,
      ]);
    } else {
      orphanFillIds.add(item.id);
    }
  }

  return items
    .filter((item) => item.kind === 'draft' || orphanFillIds.has(item.id))
    .map((item) => ({ item, fills: fillsByParent.get(item.id) ?? [] }));
};

/**
 * 페이지 단위 내역 (초안 작성 요청 기준으로 나눠 빈칸 채우기가 페이지 사이에서 끊기지 않게 함)
 * - pageJobs: 이 페이지의 초안 작성 요청 (최신순)
 * - related: 같은 초안들에서 이 페이지의 가장 오래된 요청 이후에 보낸 모든 요청 (앞 페이지의 더 최신 요청 포함)
 * - 빈칸 채우기는 가장 가까운 앞 초안 작성 요청에 붙이고, 그 요청이 이 페이지에 있는 것만 남김
 */
export const pickPageEntries = (
  pageJobs: PromptHistoryItem[],
  related: PromptHistoryItem[],
): PromptHistoryEntry[] => {
  const byId = new Map(
    [...related, ...pageJobs].map((item) => [item.id, item]),
  );
  const time = (item: PromptHistoryItem) => new Date(item.createdAt).getTime();
  const merged = [...byId.values()].sort(
    (a, b) => time(b) - time(a) || (a.id < b.id ? 1 : -1),
  );
  const entries = new Map(
    groupPromptHistory(merged).map((entry) => [entry.item.id, entry]),
  );

  return pageJobs.map((job) => entries.get(job.id) ?? { item: job, fills: [] });
};

export type UsagePercentLabel =
  | { kind: 'percent'; value: number }
  // 0 보다 크지만 1% 에 못 미침
  | { kind: 'under_one' };

/**
 * 화면에 보여 줄 사용 비율
 * - 0 이면 0%, 1% 미만이면 "1% 미만", 그 밖에는 반올림한 정수
 * @example toUsagePercentLabel(0.052) // { kind: 'percent', value: 5 }
 */
export const toUsagePercentLabel = (ratio: number): UsagePercentLabel => {
  const percent = Math.max(ratio, 0) * 100;

  if (percent > 0 && percent < 1) {
    return { kind: 'under_one' };
  }

  return { kind: 'percent', value: Math.round(percent) };
};
