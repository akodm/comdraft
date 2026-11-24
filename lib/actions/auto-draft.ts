'use server';

import { requireSession } from '@/lib/auth/session';
import {
  getAutoDraftSetting,
  saveAutoDraftSetting,
  setAutoDraftEnabled,
} from '@/lib/auto-draft/store';
import type { GenerationModel } from '@/lib/generation/contract';
import { MAX_GENERATION_PROMPT_LENGTH } from '@/lib/generation/limits';
import { getAllowedModels, isModelAllowed } from '@/lib/generation/models';
import {
  DEFAULT_PROMPT_OPTIONS,
  parsePromptOptions,
  type PromptOptions,
} from '@/lib/studio/options';
import { getStudioRepository } from '@/lib/studio/queries';

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
