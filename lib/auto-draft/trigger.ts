import {
  LENGTHS,
  POST_TYPES,
  TONES,
  type Length,
  type PostType,
  type PromptOptions,
  type Tone,
} from '@/lib/studio/options';

// 커밋 제목 줄 맨 앞에 있어야 하는 트리거 태그 (소문자 고정)
export const TRIGGER_TAG = '[comdraft]';

// 커밋 메시지로 지정할 수 있는 옵션 (톤·글 종류·길이만)
export interface TriggerOptions {
  tone?: Tone;
  postType?: PostType;
  length?: Length;
}

// 단어가 목록에 있으면 해당 값, 없으면 undefined
function pickValue<T extends string>(
  values: readonly T[],
  word: string,
): T | undefined {
  return values.find((value) => value === word);
}

// 제목 줄(첫 줄)이 트리거면 옵션, 아니면 null
export function parseTrigger(message: string): TriggerOptions | null {
  const firstLine = (message.split('\n', 1)[0] ?? '').replace(/\r$/, '');
  if (!firstLine.startsWith(TRIGGER_TAG)) return null;

  const rest = firstLine.slice(TRIGGER_TAG.length);
  // 태그 바로 뒤는 줄 끝이거나 공백/탭이어야 함
  if (rest !== '' && !/^[ \t]/.test(rest)) return null;

  const options: TriggerOptions = {};
  for (const token of rest.split(/\s+/)) {
    const word = token.toLowerCase();
    if (!word) continue;

    const tone = pickValue(TONES, word);
    const postType = pickValue(POST_TYPES, word);
    const length = pickValue(LENGTHS, word);
    // 같은 종류는 먼저 나온 값 유지
    if (tone && options.tone === undefined) options.tone = tone;
    else if (postType && options.postType === undefined)
      options.postType = postType;
    else if (length && options.length === undefined) options.length = length;
  }
  return options;
}

// 기본 옵션 위에 트리거에서 지정된 값만 덮어쓴 새 객체 (필수 블록·모델은 그대로)
export function mergeTriggerOptions(
  base: PromptOptions,
  trigger: TriggerOptions,
): PromptOptions {
  return {
    ...base,
    tone: trigger.tone ?? base.tone,
    postType: trigger.postType ?? base.postType,
    length: trigger.length ?? base.length,
  };
}
