import { describe, expect, it } from 'vitest';
import {
  checkResumeCodeInputs,
  countLines,
  matchesCodeInputMeta,
  nextCodeInputNumber,
  normalizeCode,
  parseCodeInputMeta,
  parseCodeInputs,
  toCodeInputMeta,
} from '@/lib/generation/code-input';
import {
  MAX_CODE_INPUT_CHARS,
  MAX_CODE_INPUT_LINES,
  MAX_CODE_INPUT_NAME_CHARS,
  MAX_CODE_INPUTS,
} from '@/lib/generation/limits';

const lines = (count: number) =>
  Array.from({ length: count }, (_, i) => `line ${i}`).join('\n');

describe('countLines', () => {
  it('CRLF·CR 줄바꿈을 LF 로 맞춘 뒤 끝 줄바꿈 하나를 빼고 센다', () => {
    expect(countLines('a\r\nb\r\n')).toBe(2);
    expect(countLines('a\rb')).toBe(2);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\n\n')).toBe(2);
  });

  it('normalizeCode 는 줄바꿈만 LF 로 바꾼다', () => {
    expect(normalizeCode('a\r\n\tb\rc')).toBe('a\n\tb\nc');
  });
});

describe('parseCodeInputs', () => {
  it('생략이나 빈 배열은 빈 목록, 배열이 아니면 null', () => {
    expect(parseCodeInputs(undefined)).toEqual([]);
    expect(parseCodeInputs([])).toEqual([]);
    expect(parseCodeInputs('x')).toBeNull();
  });

  it('이름과 정규화한 코드만 남긴다', () => {
    expect(
      parseCodeInputs([{ name: 'a.ts', code: 'a\r\nb', extra: 1 }]),
    ).toEqual([{ name: 'a.ts', code: 'a\nb' }]);
  });

  it('제한을 넘거나 형식이 다르면 null', () => {
    const ok = { name: 'a.ts', code: 'x' };
    const rejected: unknown[] = [
      Array.from({ length: MAX_CODE_INPUTS + 1 }, () => ok),
      [{ name: 'a.ts', code: lines(MAX_CODE_INPUT_LINES + 1) }],
      [{ name: 'a.ts', code: 'x'.repeat(MAX_CODE_INPUT_CHARS + 1) }],
      [
        { name: 'a', code: 'x'.repeat(20_000) },
        { name: 'b', code: 'x'.repeat(20_000) },
        { name: 'c', code: 'x'.repeat(10_001) },
      ],
      [{ name: 'a.ts', code: ' \n\t ' }],
      [{ name: '', code: 'x' }],
      [{ name: 'a'.repeat(MAX_CODE_INPUT_NAME_CHARS + 1), code: 'x' }],
      [{ name: 'a\nb', code: 'x' }],
      [{ name: 'a\u0000b', code: 'x' }],
      [{ name: 'a.ts', code: 1 }],
      [null],
    ];

    for (const value of rejected) {
      expect(parseCodeInputs(value)).toBeNull();
    }
  });

  it('줄 수와 글자 수 상한 그대로는 통과한다', () => {
    expect(
      parseCodeInputs([{ name: 'a', code: lines(MAX_CODE_INPUT_LINES) }]),
    ).toHaveLength(1);
    expect(
      parseCodeInputs([{ name: 'a', code: 'x'.repeat(MAX_CODE_INPUT_CHARS) }]),
    ).toHaveLength(1);
  });
});

describe('toCodeInputMeta', () => {
  it('이름과 줄 수만 남기고 코드 원문은 넣지 않는다', () => {
    const meta = toCodeInputMeta([{ name: 'a.ts', code: 'secret\ncode' }]);

    expect(meta).toEqual([{ name: 'a.ts', lines: 2 }]);
    expect(Object.keys(meta[0])).toEqual(['name', 'lines']);
    expect(JSON.stringify(meta)).not.toContain('secret');
  });
});

describe('parseCodeInputMeta', () => {
  it('저장된 값을 읽고, 형식이 다르면 빈 목록', () => {
    expect(parseCodeInputMeta([{ name: 'a.ts', lines: 2 }])).toEqual([
      { name: 'a.ts', lines: 2 },
    ]);
    expect(parseCodeInputMeta(null)).toEqual([]);
    expect(parseCodeInputMeta([{ name: 'a', lines: 0 }])).toEqual([]);
  });
});

describe('matchesCodeInputMeta', () => {
  it('순서·이름·줄 수가 모두 같을 때만 true', () => {
    const inputs = [
      { name: 'a.ts', code: 'a\nb' },
      { name: '코드 2', code: 'c' },
    ];

    expect(
      matchesCodeInputMeta(inputs, [
        { name: 'a.ts', lines: 2 },
        { name: '코드 2', lines: 1 },
      ]),
    ).toBe(true);
    expect(matchesCodeInputMeta([], [])).toBe(true);
    expect(matchesCodeInputMeta(inputs, [{ name: 'a.ts', lines: 2 }])).toBe(
      false,
    );
    expect(
      matchesCodeInputMeta(inputs, [
        { name: 'a.ts', lines: 3 },
        { name: '코드 2', lines: 1 },
      ]),
    ).toBe(false);
  });
});

describe('checkResumeCodeInputs', () => {
  const meta = [{ name: 'a.ts', lines: 2 }];

  it('코드가 없는 작업은 받은 값과 상관없이 빈 목록으로 진행한다', () => {
    expect(checkResumeCodeInputs([], undefined)).toEqual({
      status: 'ok',
      inputs: [],
    });
  });

  it('코드가 필요한 작업에 코드가 없거나 다르면 code_required', () => {
    expect(checkResumeCodeInputs(meta, undefined)).toEqual({
      status: 'code_required',
    });
    expect(
      checkResumeCodeInputs(meta, [{ name: 'a.ts', code: 'only one' }]),
    ).toEqual({ status: 'code_required' });
    expect(checkResumeCodeInputs(meta, 'bad')).toEqual({
      status: 'code_required',
    });
  });

  it('같은 코드면 정규화한 코드로 진행한다', () => {
    expect(
      checkResumeCodeInputs(meta, [{ name: 'a.ts', code: 'a\r\nb' }]),
    ).toEqual({ status: 'ok', inputs: [{ name: 'a.ts', code: 'a\nb' }] });
  });
});

describe('nextCodeInputNumber', () => {
  it('"코드 N" 중 비어 있는 가장 작은 번호', () => {
    expect(nextCodeInputNumber([], '코드')).toBe(1);
    expect(nextCodeInputNumber(['코드 1', '코드 3', 'a.ts'], '코드')).toBe(2);
    expect(nextCodeInputNumber(['Code 1'], 'Code')).toBe(2);
  });
});
