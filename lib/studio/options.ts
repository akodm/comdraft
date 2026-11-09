import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';

/**
 * 작성 요청 기본 옵션 (프롬프트 입력창 위의 프리셋)
 * - 서버(요청 검증, 저장)와 클라이언트(옵션 UI)가 같은 값을 사용
 * - 라벨은 Lingui 메시지 디스크립터로 두고 화면에서 i18n._() 으로 번역
 */

export const TONES = ['plain', 'friendly', 'professional'] as const;
export type Tone = (typeof TONES)[number];

export const POST_TYPES = ['experience', 'lecture', 'experiment'] as const;
export type PostType = (typeof POST_TYPES)[number];

export const LENGTHS = ['short', 'medium', 'long'] as const;
export type Length = (typeof LENGTHS)[number];

// 초안에 반드시 들어가야 하는 블록 (기술 용어라 라벨은 번역하지 않음)
export const REQUIRED_BLOCKS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'list',
  'code',
  'blockquote',
] as const;
export type RequiredBlock = (typeof REQUIRED_BLOCKS)[number];

export const REQUIRED_BLOCK_LABELS: Record<RequiredBlock, string> = {
  h1: 'H1',
  h2: 'H2',
  h3: 'H3',
  h4: 'H4',
  h5: 'H5',
  h6: 'H6',
  list: 'List',
  code: 'Code',
  blockquote: 'Block-Quote',
};

export const TONE_LABELS: Record<Tone, MessageDescriptor> = {
  plain: msg`담백하게`,
  friendly: msg`친근하게`,
  professional: msg`전문적으로`,
};

export const POST_TYPE_LABELS: Record<PostType, MessageDescriptor> = {
  experience: msg`경험`,
  lecture: msg`강의`,
  experiment: msg`실험`,
};

export const LENGTH_LABELS: Record<Length, MessageDescriptor> = {
  short: msg`짧게`,
  medium: msg`중간`,
  long: msg`길게`,
};

export interface PromptOptions {
  tone: Tone;
  postType: PostType;
  length: Length;
  requiredBlocks: RequiredBlock[];
}

export const DEFAULT_PROMPT_OPTIONS: PromptOptions = {
  tone: 'plain',
  postType: 'experience',
  length: 'medium',
  requiredBlocks: ['h2', 'list', 'code'],
};

const isOneOf = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T => {
  return values.includes(value as T);
};

/**
 * 클라이언트에서 받은(또는 DB 에 저장된) 옵션 값을 검증
 * - 알 수 없는 값은 null (요청 거부), 필수 블록은 중복 제거 후 정의된 순서로 정렬
 */
export const parsePromptOptions = (value: unknown): PromptOptions | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { tone, postType, length, requiredBlocks } = value as Record<
    string,
    unknown
  >;

  if (
    !isOneOf(TONES, tone) ||
    !isOneOf(POST_TYPES, postType) ||
    !isOneOf(LENGTHS, length) ||
    !Array.isArray(requiredBlocks) ||
    !requiredBlocks.every((block) => isOneOf(REQUIRED_BLOCKS, block))
  ) {
    return null;
  }

  return {
    tone,
    postType,
    length,
    requiredBlocks: REQUIRED_BLOCKS.filter((block) =>
      requiredBlocks.includes(block),
    ),
  };
};
