import { parseTrigger } from '@/lib/auto-draft/trigger';
import { MAX_GENERATION_COMMITS } from '@/lib/generation/limits';

// GitHub 가 직접 만든 커밋(웹 UI 머지 등)의 committer login
const GITHUB_COMMITTER_LOGIN = 'web-flow';

// 비교 결과의 커밋 하나 (메시지는 판정에만 쓰고 저장하지 않음)
export interface BranchCommit {
  sha: string;
  parentShas: string[];
  message: string;
  committerLogin: string | null;
}

// 기준 SHA 에서 브랜치 끝까지의 비교 결과 (commits 는 오래된 순)
export type CompareResult =
  | { status: 'ok'; commits: BranchCommit[] }
  | { status: 'anchor_missing' };

export type SkipReason = 'merge' | 'github' | 'excluded' | 'empty_trigger';

export interface SkipSets {
  excludedShas: ReadonlySet<string>;
  emptyShas: ReadonlySet<string>;
}

// 건너뛰는 사유 (여럿이면 merge → github → excluded → empty_trigger 순), 대상이면 null
export function getSkipReason(
  commit: BranchCommit,
  { excludedShas, emptyShas }: SkipSets,
): SkipReason | null {
  if (commit.parentShas.length >= 2) return 'merge';
  if (commit.committerLogin === GITHUB_COMMITTER_LOGIN) return 'github';
  if (excludedShas.has(commit.sha)) return 'excluded';
  if (parseTrigger(commit.message) !== null && emptyShas.has(commit.sha)) {
    return 'empty_trigger';
  }
  return null;
}

// 오래된 순 커밋에서 묶음(최대 20개)과 건너뛴 커밋을 계산
export function selectBatch(
  commits: BranchCommit[],
  sets: SkipSets,
): { batchShas: string[]; skipped: Map<string, SkipReason> } {
  const batchShas: string[] = [];
  const skipped = new Map<string, SkipReason>();

  for (const commit of commits) {
    // 20개가 차면 이후 커밋은 다음 묶음 몫
    if (batchShas.length >= MAX_GENERATION_COMMITS) break;
    const reason = getSkipReason(commit, sets);
    if (reason) skipped.set(commit.sha, reason);
    else batchShas.push(commit.sha);
  }

  return { batchShas, skipped };
}

// GitHub compare 의 status(404 는 null) 를 결과로 변환
export function compareStatusToResult(
  status: string | null,
): 'ok' | 'anchor_missing' {
  return status === 'ahead' || status === 'identical' ? 'ok' : 'anchor_missing';
}
