'use server';

import { requireSession } from '@/lib/auth/session';
import type { SkipReason } from '@/lib/auto-draft/batch';
import { computeAutoDraftBatch } from '@/lib/auto-draft/batch-server';
import { getBranchHead, getCommitParents } from '@/lib/auto-draft/github';
import {
  excludeCommits,
  getAutoDraftRepo,
  getAutoDraftSetting,
  listExcludedShas,
  restoreCommit,
  saveAutoDraftSetting,
  setAutoDraftEnabled,
  setBoundary,
} from '@/lib/auto-draft/store';
import type { ExcludedCommitReason } from '@/lib/db/schema/auto-draft';
import type { GenerationModel } from '@/lib/generation/contract';
import { MAX_GENERATION_PROMPT_LENGTH } from '@/lib/generation/limits';
import { getAllowedModels, isModelAllowed } from '@/lib/generation/models';
import {
  DEFAULT_PROMPT_OPTIONS,
  parsePromptOptions,
  type PromptOptions,
} from '@/lib/studio/options';
import { getStudioRepository } from '@/lib/studio/queries';
import { reportError } from '@/lib/observability/report-error';

export type AutoDraftSettingsResult =
  | {
      status: 'ok';
      enabled: boolean;
      prompt: string;
      options: PromptOptions;
      // 이 등급에서 고를 수 있는 모델 (옵션 화면의 잠금 표시용)
      allowedModels: GenerationModel[];
    }
  | { status: 'not_found' };

// 설정이 없을 때 처음 보여 줄 값 (글 길이만 짧게)
const INITIAL_OPTIONS: PromptOptions = {
  ...DEFAULT_PROMPT_OPTIONS,
  length: 'short',
};

/**
 * 저장소 설정: 커밋 트리거 자동 초안 설정 조회 (행이 없으면 꺼진 기본값)
 */
export async function getAutoDraftSettings(
  repositoryId: string,
): Promise<AutoDraftSettingsResult> {
  const { user } = await requireSession();
  const repository = await getStudioRepository(user.id, repositoryId);

  if (!repository) {
    return { status: 'not_found' };
  }

  const setting = await getAutoDraftSetting(user.id, repository.id);

  return {
    status: 'ok',
    enabled: setting?.enabled ?? false,
    prompt: setting?.prompt ?? '',
    options: setting?.options ?? INITIAL_OPTIONS,
    allowedModels: getAllowedModels(user.role),
  };
}

export type SaveAutoDraftSettingsResult =
  | { status: 'ok' }
  | { status: 'invalid' | 'not_found' | 'model_locked' };

/**
 * 저장소 설정: 자동 초안 요청 문구와 기본 옵션 저장
 * - 문구는 비어 있어도 저장 (비어 있으면 실행이 no_preset 으로 기록됨), 앞뒤 공백을 지운 뒤 4,000자 이하
 * - 등급이 쓸 수 없는 모델이면 model_locked
 */
export async function saveAutoDraftSettings(
  repositoryId: string,
  input: { prompt: unknown; options: unknown },
): Promise<SaveAutoDraftSettingsResult> {
  const { user } = await requireSession();
  const repository = await getStudioRepository(user.id, repositoryId);

  if (!repository) {
    return { status: 'not_found' };
  }

  const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : null;
  const options = parsePromptOptions(input?.options);

  if (
    prompt === null ||
    prompt.length > MAX_GENERATION_PROMPT_LENGTH ||
    !options
  ) {
    return { status: 'invalid' };
  }

  if (!isModelAllowed(user.role, options.model)) {
    return { status: 'model_locked' };
  }

  await saveAutoDraftSetting(user.id, repository.id, { prompt, options });

  return { status: 'ok' };
}

export type ToggleAutoDraftResult =
  | { status: 'ok' }
  | { status: 'not_found' | 'unavailable' };

/**
 * 저장소 설정: 자동 초안 켜기/끄기
 */
export async function toggleAutoDraft(
  repositoryId: string,
  enabled: boolean,
): Promise<ToggleAutoDraftResult> {
  const { user } = await requireSession();
  const repository = await getStudioRepository(user.id, repositoryId);

  if (!repository || typeof enabled !== 'boolean') {
    return { status: 'not_found' };
  }

  const result = await setAutoDraftEnabled(user.id, repository.id, enabled);

  return { status: result };
}

export interface AutoDraftExcluded {
  sha: string;
  reason: ExcludedCommitReason;
}

export interface AutoDraftSkipped {
  sha: string;
  reason: SkipReason;
}

export type AutoDraftStateResult =
  | { status: 'off' | 'not_found' | 'error' }
  | {
      status: 'ok';
      // 묶음의 첫 커밋 (대상이 없으면 null)
      anchorSha: string | null;
      batchShas: string[];
      // 범위 안에서 건너뛴 커밋 (수집 안 됨·이미 사용됨 표시용)
      skipped: AutoDraftSkipped[];
      excluded: AutoDraftExcluded[];
    }
  | { status: 'anchor_missing'; excluded: AutoDraftExcluded[] };

const toExcludedList = (excluded: Map<string, ExcludedCommitReason>) =>
  Array.from(excluded, ([sha, reason]) => ({ sha, reason }));

/**
 * 스튜디오 커밋 목록 표시용: 경계 다음 커밋부터 브랜치 끝까지 자동 대상 묶음을 계산 (실행기와 같은 계산)
 * - 꺼져 있으면 off, 경계가 없거나 사라졌으면 anchor_missing
 * - GitHub 조회 실패는 error (표시만 생략)
 */
export async function loadAutoDraftState(
  repositoryId: string,
): Promise<AutoDraftStateResult> {
  const { user } = await requireSession();
  const repo = await getAutoDraftRepo(user.id, repositoryId);

  if (!repo) {
    return { status: 'not_found' };
  }

  const setting = await getAutoDraftSetting(user.id, repositoryId);

  if (!setting?.enabled) {
    return { status: 'off' };
  }

  try {
    const excluded = await listExcludedShas(user.id, repositoryId);

    if (setting.boundarySha === null) {
      return { status: 'anchor_missing', excluded: toExcludedList(excluded) };
    }

    const head = await getBranchHead(repo);
    const plan = head
      ? await computeAutoDraftBatch(repo, {
          userId: user.id,
          repositoryId,
          boundarySha: setting.boundarySha,
          endSha: head,
          excluded,
        })
      : ({ status: 'anchor_missing' } as const);

    if (plan.status !== 'ok') {
      return { status: 'anchor_missing', excluded: toExcludedList(excluded) };
    }

    return {
      status: 'ok',
      anchorSha: plan.batchShas[0] ?? null,
      batchShas: plan.batchShas,
      skipped: Array.from(plan.skipped, ([sha, reason]) => ({ sha, reason })),
      excluded: toExcludedList(excluded),
    };
  } catch (error) {
    reportError(error, 'auto-draft.load-state', { repositoryId });
    return { status: 'error' };
  }
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

const isCommitSha = (value: unknown): value is string =>
  typeof value === 'string' && COMMIT_SHA_PATTERN.test(value);

export type AutoDraftCommitActionResult =
  | { status: 'ok' }
  | { status: 'invalid' | 'not_found' | 'off' | 'error' };

/**
 * 커밋 줄 동작: 이 커밋부터 자동 대상으로 삼도록 기준점을 옮김
 * - 경계(마지막으로 쓴 커밋, 제외) = 그 커밋의 첫 부모, 이전 경계와 무관하게 덮어씀
 * - 부모가 없는 루트 커밋, 머지 커밋(자동 대상이 아님), 커밋을 찾을 수 없으면 invalid
 */
export async function setAutoDraftAnchor(
  repositoryId: string,
  sha: string,
): Promise<AutoDraftCommitActionResult> {
  const { user } = await requireSession();

  if (!isCommitSha(sha)) {
    return { status: 'invalid' };
  }

  const repo = await getAutoDraftRepo(user.id, repositoryId);

  if (!repo) {
    return { status: 'not_found' };
  }

  const setting = await getAutoDraftSetting(user.id, repositoryId);

  if (!setting?.enabled) {
    return { status: 'off' };
  }

  try {
    const parentShas = await getCommitParents(repo, sha);

    if (parentShas === null || parentShas.length !== 1) {
      return { status: 'invalid' };
    }

    await setBoundary(user.id, repositoryId, parentShas[0]);

    return { status: 'ok' };
  } catch (error) {
    reportError(error, 'auto-draft.set-anchor', { repositoryId });
    return { status: 'error' };
  }
}

// 등록한 저장소에서 자동 초안이 켜져 있을 때만 제외 목록을 바꿀 수 있음
const checkExcludeAccess = async (
  userId: string,
  repositoryId: string,
  sha: string,
): Promise<AutoDraftCommitActionResult> => {
  if (!isCommitSha(sha)) {
    return { status: 'invalid' };
  }

  if (!(await getAutoDraftRepo(userId, repositoryId))) {
    return { status: 'not_found' };
  }

  const setting = await getAutoDraftSetting(userId, repositoryId);

  return setting?.enabled ? { status: 'ok' } : { status: 'off' };
};

/**
 * 커밋 줄 동작: 커밋을 자동 대상에서 제외 (사용자 제외)
 */
export async function excludeAutoDraftCommit(
  repositoryId: string,
  sha: string,
): Promise<AutoDraftCommitActionResult> {
  const { user } = await requireSession();
  const access = await checkExcludeAccess(user.id, repositoryId, sha);

  if (access.status !== 'ok') {
    return access;
  }

  await excludeCommits(user.id, repositoryId, [sha], 'user');

  return { status: 'ok' };
}

/**
 * 커밋 줄 동작: 제외한 커밋을 다시 자동 대상으로 되돌림
 */
export async function restoreAutoDraftCommit(
  repositoryId: string,
  sha: string,
): Promise<AutoDraftCommitActionResult> {
  const { user } = await requireSession();
  const access = await checkExcludeAccess(user.id, repositoryId, sha);

  if (access.status !== 'ok') {
    return access;
  }

  await restoreCommit(user.id, repositoryId, sha);

  return { status: 'ok' };
}
