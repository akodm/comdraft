import { describe, expect, it } from 'vitest';
import {
  getPaginationItems,
  getPostListHref,
  MAX_PAGE,
  parsePageParam,
  POST_LIST_PAGE_SIZE,
} from '@/lib/posts/post-list';

describe('parsePageParam', () => {
  it('없으면 1쪽', () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it('양의 정수 문자열은 그 쪽', () => {
    expect(parsePageParam('3')).toBe(3);
  });

  it('같은 이름이 여러 번 오면 첫 값 기준', () => {
    expect(parsePageParam(['2', '5'])).toBe(2);
  });

  it('너무 큰 쪽 번호는 조회할 수 있는 최대 쪽으로 (DB offset 범위를 넘지 않게, 마지막 쪽보다 커서 404)', () => {
    expect(parsePageParam('99999999999999999999')).toBe(MAX_PAGE);
    expect(parsePageParam(String(MAX_PAGE + 1))).toBe(MAX_PAGE);
    expect(parsePageParam(String(MAX_PAGE))).toBe(MAX_PAGE);
  });

  it.each(['0', '-1', '1.5', 'abc', '', '01'])(
    '양의 정수가 아니면 1쪽 (%s)',
    (value) => {
      expect(parsePageParam(value)).toBe(1);
    },
  );
});

describe('getPaginationItems', () => {
  it('1쪽뿐이면 번호를 보여주지 않음', () => {
    expect(getPaginationItems(1, 1, 2)).toEqual([]);
  });

  it('쪽이 적으면 모두', () => {
    expect(getPaginationItems(1, 5, 2)).toEqual([1, 2, 3, 4, 5]);
  });

  it('가운데 쪽이면 첫·마지막 쪽과 현재 주변, 사이는 gap', () => {
    expect(getPaginationItems(10, 20, 2)).toEqual([
      1,
      'gap',
      8,
      9,
      10,
      11,
      12,
      'gap',
      20,
    ]);
  });

  it('첫 쪽이면 앞쪽 번호와 마지막 쪽', () => {
    expect(getPaginationItems(1, 20, 2)).toEqual([1, 2, 3, 'gap', 20]);
  });

  it('건너뛰는 쪽이 하나뿐이면 gap 대신 그 번호', () => {
    expect(getPaginationItems(4, 20, 1)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
  });
});

describe('getPostListHref', () => {
  it('1쪽은 쿼리 없이', () => {
    expect(getPostListHref(1)).toBe('/posts');
  });

  it('그 밖은 page 쿼리', () => {
    expect(getPostListHref(4)).toBe('/posts?page=4');
  });
});

describe('POST_LIST_PAGE_SIZE', () => {
  it('한 쪽에 30개', () => {
    expect(POST_LIST_PAGE_SIZE).toBe(30);
  });
});
