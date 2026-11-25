import { getOwnSkipReason, type SkipReason } from '@/lib/auto-draft/batch';

/**
 * 스튜디오 커밋 줄에 붙이는 자동 초안 표시 계산 (순수 함수)
 */

export type ExcludedReason = 'user' | 'force_push';

export type CommitMarker =
  | { kind: 'anchor' }
  // position: 묶음 안 순번 (1부터)
  | { kind: 'auto'; position: number }
  | { kind: 'excluded'; reason: ExcludedReason }
  | { kind: 'not_collected' };

export interface MarkerCommit {
  sha: string;
  parentShas: string[];
  committerLogin: string | null;
}

export interface MarkerState {
  anchorSha: string | null;
  batchShas: string[];
  // 서버가 계산한 범위(경계 다음 ~ 브랜치 끝) 안에서 건너뛴 커밋과 사유
  skipped: ReadonlyMap<string, SkipReason>;
  excluded: ReadonlyMap<string, ExcludedReason>;
}

// 자동 대상에 들어갈 수 없는 사유 (머지 커밋, GitHub 가 만든 커밋, 머지로 들어온 커밋)
const NOT_COLLECTED_REASONS: ReadonlySet<SkipReason> = new Set([
  'merge',
  'github',
  'side',
]);

/**
 * 자동 대상에 들어갈 수 있는 커밋인지
 * - 계산한 범위 안이면 서버 사유를 그대로 따름
 * - 범위 밖(경계 이전, 20개 이후 등)은 커밋 자체 정보로 머지·GitHub 커밋만 가림
 */
export const isCollectable = (
  commit: MarkerCommit,
  { batchShas, skipped }: Pick<MarkerState, 'batchShas' | 'skipped'>,
) => {
  const reason = skipped.get(commit.sha);

  if (reason) return !NOT_COLLECTED_REASONS.has(reason);
  if (batchShas.includes(commit.sha)) return true;

  return getOwnSkipReason(commit) === null;
};

// 건너뛰는 우선순위(수집 안 됨 → 제외)는 서버의 getSkipReason 과 같음
export const getCommitMarkers = (
  commit: MarkerCommit,
  state: MarkerState,
): CommitMarker[] => {
  if (!isCollectable(commit, state)) return [{ kind: 'not_collected' }];

  const reason = state.excluded.get(commit.sha);

  if (reason) return [{ kind: 'excluded', reason }];

  const index = state.batchShas.indexOf(commit.sha);

  if (index < 0) return [];

  const markers: CommitMarker[] = [];

  if (commit.sha === state.anchorSha) markers.push({ kind: 'anchor' });

  markers.push({ kind: 'auto', position: index + 1 });

  return markers;
};
