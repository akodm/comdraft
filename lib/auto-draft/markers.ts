import { isMergeCommit, type SkipReason } from '@/lib/auto-draft/batch';

/**
 * 스튜디오 커밋 줄에 붙이는 자동 초안 표시 계산 (순수 함수)
 */

export type ExcludedReason = 'user' | 'force_push';

export type CommitMarker =
  | { kind: 'anchor' }
  // position: 묶음 안 순번 (1부터)
  | { kind: 'auto'; position: number }
  | { kind: 'excluded'; reason: ExcludedReason }
  // 이전 자동 초안에 이미 쓴 커밋
  | { kind: 'consumed' }
  // 머지 커밋 (내용이 없어 자동 대상이 아님)
  | { kind: 'not_collected' };

export interface MarkerCommit {
  sha: string;
  parentShas: string[];
}

export interface MarkerState {
  anchorSha: string | null;
  batchShas: string[];
  // 서버가 계산한 범위(경계 다음 ~ 브랜치 끝) 안에서 건너뛴 커밋과 사유
  skipped: ReadonlyMap<string, SkipReason>;
  excluded: ReadonlyMap<string, ExcludedReason>;
}

/**
 * 자동 대상에 들어갈 수 있는 커밋인지 (머지 커밋만 아님)
 * - 계산한 범위 안이면 서버 사유를, 범위 밖(경계 이전, 20개 이후 등)은 부모 수를 봄
 * - PR 로 들어온 커밋, GitHub 가 만든 squash·rebase 커밋도 수집 대상
 */
export const isCollectable = (
  commit: MarkerCommit,
  { skipped }: Pick<MarkerState, 'skipped'>,
) => skipped.get(commit.sha) !== 'merge' && !isMergeCommit(commit);

// 이전 자동 초안에 이미 쓴 커밋인지 (서버가 계산한 범위 안에서만 알 수 있음)
const isConsumed = (
  commit: MarkerCommit,
  { skipped }: Pick<MarkerState, 'skipped'>,
) => skipped.get(commit.sha) === 'consumed';

// 표시 우선순위(수집 안 됨 → 제외 → 이미 사용됨)는 서버의 getSkipReason 과 같음
export const getCommitMarkers = (
  commit: MarkerCommit,
  state: MarkerState,
): CommitMarker[] => {
  if (!isCollectable(commit, state)) return [{ kind: 'not_collected' }];

  const reason = state.excluded.get(commit.sha);

  if (reason) return [{ kind: 'excluded', reason }];

  if (isConsumed(commit, state)) return [{ kind: 'consumed' }];

  const index = state.batchShas.indexOf(commit.sha);

  if (index < 0) return [];

  const markers: CommitMarker[] = [];

  if (commit.sha === state.anchorSha) markers.push({ kind: 'anchor' });

  markers.push({ kind: 'auto', position: index + 1 });

  return markers;
};

/**
 * 커밋 줄 메뉴 구성 ("여기를 기준점으로" 는 메뉴가 있으면 항상 있음)
 * - 머지 커밋: 메뉴 없음 (null)
 * - exclude: 제외 / 제외 취소 / 없음 (이미 사용된 커밋은 다시 쓰이지 않아 제외할 필요가 없음)
 */
export const getCommitMenu = (
  commit: MarkerCommit,
  state: MarkerState,
): { exclude: 'exclude' | 'restore' | null } | null => {
  if (!isCollectable(commit, state)) return null;

  if (state.excluded.has(commit.sha)) return { exclude: 'restore' };

  return { exclude: isConsumed(commit, state) ? null : 'exclude' };
};
