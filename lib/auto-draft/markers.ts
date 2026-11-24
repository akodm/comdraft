/**
 * 스튜디오 커밋 줄에 붙이는 자동 초안 표시 계산 (순수 함수)
 */

// GitHub 가 직접 만든 커밋(웹 UI 머지 등)의 committer login
const GITHUB_COMMITTER_LOGIN = 'web-flow';

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
  excluded: ReadonlyMap<string, ExcludedReason>;
}

// 머지 커밋·GitHub 가 만든 커밋은 자동 대상에 들어가지 않음
export const isCollectable = (commit: MarkerCommit) =>
  commit.parentShas.length <= 1 &&
  commit.committerLogin !== GITHUB_COMMITTER_LOGIN;

// 건너뛰는 우선순위(수집 안 됨 → 제외)는 서버의 getSkipReason 과 같음
export const getCommitMarkers = (
  commit: MarkerCommit,
  { anchorSha, batchShas, excluded }: MarkerState,
): CommitMarker[] => {
  if (!isCollectable(commit)) return [{ kind: 'not_collected' }];

  const reason = excluded.get(commit.sha);

  if (reason) return [{ kind: 'excluded', reason }];

  const index = batchShas.indexOf(commit.sha);

  if (index < 0) return [];

  const markers: CommitMarker[] = [];

  if (commit.sha === anchorSha) markers.push({ kind: 'anchor' });

  markers.push({ kind: 'auto', position: index + 1 });

  return markers;
};
