import 'server-only';
import {
  resolveFirstParentRange,
  selectFirstParentBatch,
  type BatchPlan,
} from '@/lib/auto-draft/batch';
import {
  compareBranch,
  findEmptyCommits,
  type AutoDraftRepo,
} from '@/lib/auto-draft/github';
import { parseTrigger } from '@/lib/auto-draft/trigger';

// GitHub 조회 (테스트에서 바꿔 끼움)
export interface BatchIo {
  compare: typeof compareBranch;
  findEmptyCommits: typeof findEmptyCommits;
}

const defaultIo: BatchIo = {
  compare: (repo, base, head) => compareBranch(repo, base, head),
  findEmptyCommits: (repo, shas) => findEmptyCommits(repo, shas),
};

export interface AutoDraftBatchInput {
  // 마지막으로 쓴 커밋 (제외)
  boundarySha: string;
  // compare 끝: 스튜디오는 브랜치 끝, 실행기는 푸시 끝
  headSha: string;
  excluded: ReadonlyMap<string, unknown>;
  // 실행기만: 푸시의 트리거 후보 → 사슬 위 가장 최신 후보까지가 묶음 범위
  triggerShas?: readonly string[];
}

/**
 * 경계(제외) 다음부터 끝 커밋까지의 자동 대상 묶음 (실행기와 스튜디오 표시가 함께 씀)
 * - compare 한 번 → 첫 부모 사슬 구간(끝 커밋 결정) → 구간의 트리거 커밋만 빈 커밋 확인 → 묶음 계산
 * - 경계가 사라졌거나 첫 부모 사슬 위에 없으면 anchor_missing
 * - 트리거 후보가 모두 사슬 밖이면 trigger_not_on_branch
 */
export async function computeAutoDraftBatch(
  repo: AutoDraftRepo,
  { boundarySha, headSha, excluded, triggerShas }: AutoDraftBatchInput,
  io: BatchIo = defaultIo,
): Promise<BatchPlan> {
  const compared = await io.compare(repo, boundarySha, headSha);
  if (compared.status !== 'ok') return { status: 'anchor_missing' };

  const range = resolveFirstParentRange(
    compared.commits,
    boundarySha,
    headSha,
    triggerShas,
  );
  if (range.status !== 'ok') return range;

  const rangeTriggerShas = range.chain
    .filter((commit) => parseTrigger(commit.message) !== null)
    .map((commit) => commit.sha);
  const emptyShas =
    rangeTriggerShas.length > 0
      ? await io.findEmptyCommits(repo, rangeTriggerShas)
      : new Set<string>();

  return selectFirstParentBatch(range, {
    excludedShas: new Set(excluded.keys()),
    emptyShas,
  });
}
