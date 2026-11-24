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

// side: 머지로 들어온 커밋 (추적 브랜치의 첫 부모 사슬에 없음)
export type SkipReason =
  | 'merge'
  | 'github'
  | 'excluded'
  | 'empty_trigger'
  | 'side';

export interface SkipSets {
  excludedShas: ReadonlySet<string>;
  emptyShas: ReadonlySet<string>;
}

export interface BatchSelection {
  // 오래된 순, 최대 20개
  batchShas: string[];
  skipped: Map<string, SkipReason>;
  // 20개 제한에 걸리지 않고 끝 커밋까지 다 봤는지
  exhausted: boolean;
}

// trigger_not_on_branch: 트리거 후보가 모두 첫 부모 사슬 밖(머지로 들어온 커밋)
export type BatchPlan =
  | ({ status: 'ok'; endSha: string } & BatchSelection)
  | { status: 'anchor_missing' }
  | { status: 'trigger_not_on_branch' };

/**
 * 묶음을 고를 첫 부모 사슬 구간
 * - chain: 경계 다음 ~ 끝 커밋 (오래된 순), endSha: 끝 커밋 (트리거 커밋 또는 브랜치 끝)
 * - sideShas: compare 범위 안에서 사슬 밖에 있는 커밋 (머지로 들어온 커밋)
 */
export type FirstParentRange =
  | {
      status: 'ok';
      endSha: string;
      chain: BranchCommit[];
      sideShas: string[];
    }
  | { status: 'anchor_missing' }
  | { status: 'trigger_not_on_branch' };

// 커밋 자체 정보로만 정해지는 건너뛰기 사유 (머지 커밋, GitHub 가 만든 커밋), 해당 없으면 null
export function getOwnSkipReason(
  commit: Pick<BranchCommit, 'parentShas' | 'committerLogin'>,
): 'merge' | 'github' | null {
  if (commit.parentShas.length >= 2) return 'merge';
  if (commit.committerLogin === GITHUB_COMMITTER_LOGIN) return 'github';
  return null;
}

// 건너뛰는 사유 (여럿이면 merge → github → excluded → empty_trigger 순), 대상이면 null
export function getSkipReason(
  commit: BranchCommit,
  { excludedShas, emptyShas }: SkipSets,
): SkipReason | null {
  const own = getOwnSkipReason(commit);
  if (own) return own;
  if (excludedShas.has(commit.sha)) return 'excluded';
  if (parseTrigger(commit.message) !== null && emptyShas.has(commit.sha)) {
    return 'empty_trigger';
  }
  return null;
}

/**
 * 끝 커밋에서 첫 부모만 따라 경계(제외)까지 거슬러 올라간 사슬 (오래된 순)
 * - 머지로 들어온 커밋(두 번째 이후 부모 쪽)은 사슬에 들어가지 않음
 * - 경계에 닿기 전에 compare 목록을 벗어나면 null (경계가 첫 부모 사슬 위에 없음)
 */
export function getFirstParentChain(
  commits: BranchCommit[],
  boundarySha: string,
  endSha: string,
): BranchCommit[] | null {
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]));
  const chain: BranchCommit[] = [];
  let current = endSha;

  while (current !== boundarySha) {
    const commit = bySha.get(current);
    // 목록에 없는 커밋이거나 같은 커밋을 다시 만나면 경계에 닿을 수 없음
    if (!commit || chain.length >= commits.length) return null;
    chain.push(commit);
    const parent = commit.parentShas[0];
    if (parent === undefined) return null;
    current = parent;
  }

  return chain.reverse();
}

// 오래된 순 커밋에서 묶음(최대 20개)과 건너뛴 커밋을 계산
export function selectBatch(
  commits: BranchCommit[],
  sets: SkipSets,
): BatchSelection {
  const batchShas: string[] = [];
  const skipped = new Map<string, SkipReason>();

  for (const commit of commits) {
    // 20개가 차면 이후 커밋은 다음 묶음 몫
    if (batchShas.length >= MAX_GENERATION_COMMITS) {
      return { batchShas, skipped, exhausted: false };
    }
    const reason = getSkipReason(commit, sets);
    if (reason) skipped.set(commit.sha, reason);
    else batchShas.push(commit.sha);
  }

  return { batchShas, skipped, exhausted: true };
}

/**
 * compare 목록(경계...푸시 끝, 오래된 순) 에서 묶음을 고를 첫 부모 사슬 구간을 정함
 * - 사슬은 headSha 에서 첫 부모만 따라 경계까지, 닿지 않으면 anchor_missing (후보가 있어도)
 * - triggerShas 가 없으면(스튜디오) 끝 커밋은 headSha
 * - 있으면(실행기) 사슬 위에 있는 후보 중 가장 최신 것이 끝 커밋, 사슬은 거기까지 자름
 *   → 하나도 없으면 trigger_not_on_branch (머지로 들어온 [comdraft] 는 실행하지 않음)
 */
export function resolveFirstParentRange(
  commits: BranchCommit[],
  boundarySha: string,
  headSha: string,
  triggerShas?: readonly string[],
): FirstParentRange {
  const chain = getFirstParentChain(commits, boundarySha, headSha);
  if (chain === null) return { status: 'anchor_missing' };

  const chainShas = new Set(chain.map((commit) => commit.sha));
  const sideShas = commits
    .filter((commit) => !chainShas.has(commit.sha))
    .map((commit) => commit.sha);

  if (triggerShas === undefined) {
    return { status: 'ok', endSha: headSha, chain, sideShas };
  }

  const candidates = new Set(triggerShas);
  const endIndex = chain.findLastIndex((commit) => candidates.has(commit.sha));
  if (endIndex < 0) return { status: 'trigger_not_on_branch' };

  return {
    status: 'ok',
    endSha: chain[endIndex].sha,
    chain: chain.slice(0, endIndex + 1),
    sideShas,
  };
}

/**
 * 첫 부모 사슬 구간에서 묶음을 계산 (구간이 ok 가 아니면 그대로 돌려줌)
 * - 사슬 밖 커밋은 모두 side 로 건너뜀, 사슬 커밋에는 기존 건너뛰기 규칙과 20개 제한 적용
 */
export function selectFirstParentBatch(
  range: FirstParentRange,
  sets: SkipSets,
): BatchPlan {
  if (range.status !== 'ok') return range;

  const skipped = new Map<string, SkipReason>(
    range.sideShas.map((sha) => [sha, 'side']),
  );
  const selection = selectBatch(range.chain, sets);
  for (const [sha, reason] of selection.skipped) skipped.set(sha, reason);

  return { status: 'ok', endSha: range.endSha, ...selection, skipped };
}

// GitHub compare 의 status(404 는 null) 를 결과로 변환
export function compareStatusToResult(
  status: string | null,
): 'ok' | 'anchor_missing' {
  return status === 'ahead' || status === 'identical' ? 'ok' : 'anchor_missing';
}
