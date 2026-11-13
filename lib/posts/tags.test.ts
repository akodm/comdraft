import { describe, expect, it } from 'vitest';
import { addTag, normalizeTag, normalizeTags } from '@/lib/posts/tags';

const tenTags = Array.from({ length: 10 }, (_, i) => `t${i}`);

describe('normalizeTag', () => {
  it('소문자, 앞뒤 공백 제거, 안쪽 공백은 - 하나로', () => {
    expect(normalizeTag('  React Native ')).toBe('react-native');
    expect(normalizeTag('react   native')).toBe('react-native');
  });

  it('., # 같은 글자는 그대로', () => {
    expect(normalizeTag('Next.js')).toBe('next.js');
    expect(normalizeTag('C#')).toBe('c#');
  });

  it('공백뿐이면 빈 문자열', () => {
    expect(normalizeTag('   ')).toBe('');
  });

  it('30 코드 포인트로 자르고 끝의 - 는 지움', () => {
    expect(Array.from(normalizeTag('a'.repeat(40))).length).toBe(30);
    expect(normalizeTag(`${'a'.repeat(29)} b`)).toBe('a'.repeat(29));
    expect(Array.from(normalizeTag('가'.repeat(40))).length).toBe(30);
  });
});

describe('normalizeTags', () => {
  it('문자열만, 정규화 뒤 빈 값·중복 제거 (먼저 것 유지)', () => {
    expect(normalizeTags(['TypeScript', 'typescript', '', 'react', 3])).toEqual(
      ['typescript', 'react'],
    );
  });

  it('배열이 아니면 빈 배열', () => {
    expect(normalizeTags('x')).toEqual([]);
    expect(normalizeTags(null)).toEqual([]);
  });

  it('최대 10개', () => {
    expect(
      normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`)),
    ).toHaveLength(10);
  });
});

describe('addTag', () => {
  it('이미 있으면 duplicate', () => {
    expect(addTag(['react'], 'React')).toEqual({ status: 'duplicate' });
  });

  it('빈 입력은 empty', () => {
    expect(addTag([], '  ')).toEqual({ status: 'empty' });
  });

  it('10개가 찼으면 full', () => {
    expect(addTag(tenTags, 'new')).toEqual({ status: 'full' });
  });

  it('정규화해서 끝에 추가', () => {
    expect(addTag(['react'], 'Vercel')).toEqual({
      status: 'added',
      tags: ['react', 'vercel'],
    });
  });
});
