import { parseTrigger } from '@/lib/auto-draft/trigger';
import { MAX_GENERATION_COMMITS } from '@/lib/generation/limits';

// 비교 결과의 커밋 하나 (메시지는 판정에만 쓰고 저장하지 않음)
export interface BranchCommit {
  sha: string;
  parentShas: string[];
  message: string;
}

// 경계에서 범위 끝까지의 비교 결과 (commits 는 GitHub compare 순서 그대로, 오래된 순)
export type CompareResult =
  | { status: 'ok'; commits: BranchCommit[] }
  | { status: 'anchor_missing' };

/**
 * 묶음에서 건너뛰는 사유 (20개 수에 넣지 않음)
 * - merge: 머지 커밋 (부모 2개 이상, 내용이 없음)
 * - excluded: 제외 목록 (사용자 제외, force push)
 * - consumed: 이전 자동 초안에 이미 쓴 커밋 (실패한 작업의 커밋은 해당 없음)
 * - empty_trigger: 변경 파일이 없는 트리거 커밋
 */
export type SkipReason = 'merge' | 'excluded' | 'consumed' | 'empty_trigger';

export interface SkipSets {
  excludedShas: ReadonlySet<string>;
  consumedShas: ReadonlySet<string>;
  emptyShas: ReadonlySet<string>;
}

export interface BatchSelection {
  // 오래된 순, 최대 20개
  batchShas: string[];
  skipped: Map<string, SkipReason>;
  // 20개 제한에 걸리지 않고 범위 끝까지 다 봤는지
  exhausted: boolean;
}

export type BatchPlan =
  | ({ status: 'ok' } & BatchSelection)
  | { status: 'anchor_missing' };

// 부모가 둘 이상이면 머지 커밋
export function isMergeCommit(commit: Pick<BranchCommit, 'parentShas'>) {
  return commit.parentShas.length >= 2;
}

// 빈 커밋 확인 대상: 제목이 트리거이고 부모가 하나인 커밋 (머지 커밋은 이미 merge 로 건너뜀)
export function isEmptyTriggerCandidate(commit: BranchCommit) {
  return (
    commit.parentShas.length === 1 && parseTrigger(commit.message) !== null
  );
}

// 건너뛰는 사유 (여럿이면 merge → excluded → consumed → empty_trigger 순), 대상이면 null
export function getSkipReason(
  commit: BranchCommit,
  { excludedShas, consumedShas, emptyShas }: SkipSets,
): SkipReason | null {
  if (isMergeCommit(commit)) return 'merge';
  if (excludedShas.has(commit.sha)) return 'excluded';
  if (consumedShas.has(commit.sha)) return 'consumed';
  if (isEmptyTriggerCandidate(commit) && emptyShas.has(commit.sha)) {
    return 'empty_trigger';
  }
  return null;
}

/**
 * compare 범위(경계 다음 ~ 범위 끝)의 커밋에서 묶음(최대 20개)과 건너뛴 커밋을 계산
 * - PR 로 들어온 커밋, GitHub 가 만든 squash·rebase 커밋, 웹 편집 커밋도 일반 커밋처럼 대상
 */
export function selectBatch(
  commits: BranchCommit[],
  sets: SkipSets,
): BatchSelection {
  const batchShas: string[] = [];
  const skipped = new Map<string, SkipReason>();

  for (const commit of commits) {
    const reason = getSkipReason(commit, sets);
    if (reason) {
      skipped.set(commit.sha, reason);
      continue;
    }
    // 20개가 찬 뒤 대상이 하나라도 더 있으면 그 커밋부터 다음 묶음 몫
    // → 뒤에 건너뛸 커밋(머지 커밋 등)만 남았으면 끝까지 본 것
    if (batchShas.length >= MAX_GENERATION_COMMITS) {
      return { batchShas, skipped, exhausted: false };
    }
    batchShas.push(commit.sha);
  }

  return { batchShas, skipped, exhausted: true };
}

/**
 * GitHub compare 의 status(404 는 null) 를 결과로 변환
 * - ahead: 범위에 커밋이 있음
 * - identical·behind: 경계 이후 새 커밋이 없음 (웹훅 재전송 등)
 * - diverged·404: 경계가 범위 끝의 조상이 아님 (force push 로 사라짐 등)
 */
export function compareStatusToResult(
  status: string | null,
): 'ok' | 'empty' | 'anchor_missing' {
  if (status === 'ahead') return 'ok';
  if (status === 'identical' || status === 'behind') return 'empty';
  return 'anchor_missing';
}
