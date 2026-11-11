import 'server-only';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import type { Locale } from '@/lib/i18n/config';
import { getI18nInstance } from '@/lib/i18n/instances';
import { BLANK_KINDS, type BlankKind } from '@/lib/studio/draft-blank';

/**
 * 안내 문구(hint)가 빈 빈칸의 종류별 기본 질문
 * - 편집기가 빈칸 머리에 보여 주는 문구(components/studio/draft-editor.tsx 의 blank.kinds.*.fallback)와 같은 메시지
 */
const BLANK_DEFAULT_QUESTIONS: Record<BlankKind, MessageDescriptor> = {
  motivation: msg`이 부분에 작업 계기를 작성해 주세요`,
  result: msg`이 부분에 결과나 수치를 작성해 주세요`,
  lesson: msg`이 부분에 배운 점을 작성해 주세요`,
  detail: msg`이 부분은 자세한 설명이 필요합니다`,
};

// 작업 로케일로 번역한 종류별 기본 질문
export const getDefaultBlankQuestions = (
  locale: Locale,
): Record<BlankKind, string> => {
  const i18n = getI18nInstance(locale);

  return Object.fromEntries(
    BLANK_KINDS.map((kind) => [kind, i18n._(BLANK_DEFAULT_QUESTIONS[kind])]),
  ) as Record<BlankKind, string>;
};
