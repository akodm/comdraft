import 'server-only';
import {
  isEmptyTriggerCandidate,
  selectBatch,
  type BatchPlan,
} from '@/lib/auto-draft/batch';
import {
  compareBranch,
  findEmptyCommits,
  type AutoDraftRepo,
} from '@/lib/auto-draft/github';
import { findConsumedShas } from '@/lib/auto-draft/store';

// GitHub·DB 조회 (테스트에서 바꿔 끼움)
export interface BatchIo {
  compare: typeof compareBranch;
  findEmptyCommits: typeof findEmptyCommits;
  findConsumedShas: typeof findConsumedShas;
}

const defaultIo: BatchIo = {
  compare: (repo, base, head) => compareBranch(repo, base, head),
  findEmptyCommits: (repo, shas) => findEmptyCommits(repo, shas),
  findConsumedShas: (userId, repositoryId, shas) =>
    findConsumedShas(userId, repositoryId, shas),
};

export interface AutoDraftBatchInput {
  userId: string;
  repositoryId: string;
  // 마지막으로 처리한 커밋 (제외)
  boundarySha: string;
  // 범위 끝: 스튜디오는 브랜치 끝, 실행기는 푸시 끝(after)
  endSha: string;
  excluded: ReadonlyMap<string, unknown>;
}

/**
 * 경계(제외) 다음부터 범위 끝까지의 자동 대상 묶음 (실행기와 스튜디오 표시가 함께 씀)
 * - compare(경계...끝) 한 번 → 범위 커밋을 그대로 대상 후보로 (PR 로 들어온 커밋 포함)
 * - 빈 커밋 확인은 제목이 트리거이고 부모가 하나인 커밋에만
 * - 이 사용자·저장소의 이전 자동 초안에 쓴 커밋(consumed)과 제외 커밋은 건너뜀
 * - 경계가 범위 끝의 조상이 아니면(diverged·404) anchor_missing
 */
export async function computeAutoDraftBatch(
  repo: AutoDraftRepo,
  { userId, repositoryId, boundarySha, endSha, excluded }: AutoDraftBatchInput,
  io: BatchIo = defaultIo,
): Promise<BatchPlan> {
  const compared = await io.compare(repo, boundarySha, endSha);
  if (compared.status !== 'ok') return { status: 'anchor_missing' };

  const { commits } = compared;
  // identical·behind: 새 커밋이 없어 조회할 것도 없음
  if (commits.length === 0) {
    return { status: 'ok', batchShas: [], skipped: new Map(), exhausted: true };
  }

  const triggerShas = commits
    .filter(isEmptyTriggerCandidate)
    .map((commit) => commit.sha);
  const [emptyShas, consumedShas] = await Promise.all([
    triggerShas.length > 0
      ? io.findEmptyCommits(repo, triggerShas)
      : new Set<string>(),
    io.findConsumedShas(
      userId,
      repositoryId,
      commits.map((commit) => commit.sha),
    ),
  ]);

  return {
    status: 'ok',
    ...selectBatch(commits, {
      excludedShas: new Set(excluded.keys()),
      consumedShas,
      emptyShas,
    }),
  };
}
