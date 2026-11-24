import 'server-only';
import {
  getFirstParentChain,
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

/**
 * 경계(제외) 다음부터 끝 커밋까지의 자동 대상 묶음 (실행기와 스튜디오 표시가 함께 씀)
 * - compare → 첫 부모 사슬 → 사슬의 트리거 커밋만 빈 커밋 확인 → 묶음 계산
 * - 경계가 사라졌거나 첫 부모 사슬 위에 없으면 anchor_missing
 */
export async function computeAutoDraftBatch(
  repo: AutoDraftRepo,
  boundarySha: string,
  endSha: string,
  excluded: ReadonlyMap<string, unknown>,
  io: BatchIo = defaultIo,
): Promise<BatchPlan> {
  const compared = await io.compare(repo, boundarySha, endSha);
  if (compared.status !== 'ok') return { status: 'anchor_missing' };

  const chain = getFirstParentChain(compared.commits, boundarySha, endSha);
  if (chain === null) return { status: 'anchor_missing' };

  const triggerShas = chain
    .filter((commit) => parseTrigger(commit.message) !== null)
    .map((commit) => commit.sha);
  const emptyShas =
    triggerShas.length > 0
      ? await io.findEmptyCommits(repo, triggerShas)
      : new Set<string>();

  return selectFirstParentBatch(compared.commits, boundarySha, endSha, {
    excludedShas: new Set(excluded.keys()),
    emptyShas,
  });
}
