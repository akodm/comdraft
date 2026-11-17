import type {
  CodeInputMeta,
  GenerationCodeInput,
} from '@/lib/generation/contract';
import {
  MAX_CODE_INPUT_CHARS,
  MAX_CODE_INPUT_LINES,
  MAX_CODE_INPUT_NAME_CHARS,
  MAX_CODE_INPUT_TOTAL_CHARS,
  MAX_CODE_INPUTS,
} from '@/lib/generation/limits';

/**
 * 직접 입력 코드 규칙 (서버/클라이언트 공용, comdraft-lambda src/generation/code-input.ts 와 같은 규칙)
 * - 코드는 화면 메모리와 요청 본문에만 있고, DB 에는 이름과 줄 수(CodeInputMeta)만 저장
 * - 되묻기 재실행 때 화면이 다시 보낸 코드가 처음 코드인지 이름·줄 수로 맞춰 봄
 */

// 이름에 넣을 수 없는 줄바꿈·탭 같은 제어 문자 (U+0000~U+001F, U+007F)
const hasControlChar = (text: string) =>
  [...text].some((ch) => {
    const code = ch.charCodeAt(0);

    return code <= 0x1f || code === 0x7f;
  });

// 줄바꿈을 LF 로 맞춤 (화면·서버·Lambda 가 같은 줄 수를 세도록)
export const normalizeCode = (code: string) => code.replace(/\r\n?/g, '\n');

// 끝 줄바꿈 하나를 뺀 줄 수
export const countLines = (code: string) =>
  normalizeCode(code).replace(/\n$/, '').split('\n').length;

export const isValidCodeInputName = (name: unknown): name is string =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= MAX_CODE_INPUT_NAME_CHARS &&
  !hasControlChar(name);

// 정규화한 코드 하나가 제한 안인지 (비어 있거나 공백만 있으면 false)
export const isValidCode = (code: string) =>
  code.trim().length > 0 &&
  code.length <= MAX_CODE_INPUT_CHARS &&
  countLines(code) <= MAX_CODE_INPUT_LINES;

/**
 * 요청 값 → 직접 입력 코드 목록 (생략은 빈 목록, 형식이 다르거나 제한을 넘으면 null)
 * - 이름과 정규화한 코드만 남김
 */
export const parseCodeInputs = (
  value: unknown,
): GenerationCodeInput[] | null => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > MAX_CODE_INPUTS) {
    return null;
  }

  const inputs: GenerationCodeInput[] = [];
  let total = 0;

  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      return null;
    }

    const { name, code } = item as Record<string, unknown>;

    if (!isValidCodeInputName(name) || typeof code !== 'string') {
      return null;
    }

    const normalized = normalizeCode(code);

    if (!isValidCode(normalized)) {
      return null;
    }

    total += normalized.length;
    inputs.push({ name, code: normalized });
  }

  return total > MAX_CODE_INPUT_TOTAL_CHARS ? null : inputs;
};

// 저장할 메타데이터 (이름·줄 수만, 코드 원문은 넣지 않음)
export const toCodeInputMeta = (
  inputs: GenerationCodeInput[],
): CodeInputMeta[] =>
  inputs.map(({ name, code }) => ({ name, lines: countLines(code) }));

// draft_prompt.code_inputs 값 → 메타데이터 (형식이 다르면 빈 목록)
export const parseCodeInputMeta = (value: unknown): CodeInputMeta[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const meta: CodeInputMeta[] = [];

  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      return [];
    }

    const { name, lines } = item as Record<string, unknown>;

    if (
      typeof name !== 'string' ||
      typeof lines !== 'number' ||
      !Number.isInteger(lines) ||
      lines < 1
    ) {
      return [];
    }

    meta.push({ name, lines });
  }

  return meta;
};

// 코드가 저장된 이름·줄 수와 순서까지 같은지
export const matchesCodeInputMeta = (
  inputs: GenerationCodeInput[],
  meta: CodeInputMeta[],
) =>
  inputs.length === meta.length &&
  inputs.every(
    (input, index) =>
      input.name === meta[index].name &&
      countLines(input.code) === meta[index].lines,
  );

export type ResumeCodeInputsCheck =
  | { status: 'ok'; inputs: GenerationCodeInput[] }
  // 처음 보낸 코드가 필요한데 없거나 다름 (화면이 다시 넣게 함)
  | { status: 'code_required' };

/**
 * 되묻기 재실행 때 화면이 다시 보낸 코드 확인
 * - 코드 없이 보낸 작업은 받은 값을 무시
 * - 코드를 넣은 작업은 처음과 개수·순서·이름·줄 수가 모두 같아야 함
 */
export const checkResumeCodeInputs = (
  meta: CodeInputMeta[],
  received: unknown,
): ResumeCodeInputsCheck => {
  if (meta.length === 0) {
    return { status: 'ok', inputs: [] };
  }

  const inputs = parseCodeInputs(received);

  return inputs && matchesCodeInputMeta(inputs, meta)
    ? { status: 'ok', inputs }
    : { status: 'code_required' };
};

/**
 * 이름을 비운 코드에 붙일 번호: "{baseLabel} N" 중 비어 있는 가장 작은 N (1부터)
 * @example nextCodeInputNumber(['코드 1', '코드 3'], '코드') // 2
 */
export const nextCodeInputNumber = (names: string[], baseLabel: string) => {
  const used = new Set(names);
  let number = 1;

  while (used.has(`${baseLabel} ${number}`)) {
    number += 1;
  }

  return number;
};
