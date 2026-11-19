import { describe, expect, it } from 'vitest';
import {
  ADMIN_PAGE_SIZE,
  buildAdminPageHref,
  getAdminTotalPages,
} from '@/lib/admin/pagination';

describe('getAdminTotalPages', () => {
  it('행이 없어도 1쪽', () => {
    expect(getAdminTotalPages(0, ADMIN_PAGE_SIZE)).toBe(1);
  });

  it('남는 행이 있으면 한 쪽 더', () => {
    expect(getAdminTotalPages(50, ADMIN_PAGE_SIZE)).toBe(1);
    expect(getAdminTotalPages(51, ADMIN_PAGE_SIZE)).toBe(2);
    expect(getAdminTotalPages(101, ADMIN_PAGE_SIZE)).toBe(3);
  });
});

describe('buildAdminPageHref', () => {
  const basePath = '/ko/admin/key/users';

  it('1쪽은 page 를 붙이지 않음', () => {
    expect(buildAdminPageHref(basePath, {}, 1)).toBe(basePath);
  });

  it('검색어를 유지하고 쪽 번호를 붙임', () => {
    expect(buildAdminPageHref(basePath, { q: 'kim' }, 2)).toBe(
      `${basePath}?q=kim&page=2`,
    );
  });

  it('쿼리에 있던 page 와 빈 값은 버림', () => {
    expect(buildAdminPageHref(basePath, { q: '', page: '7' }, 3)).toBe(
      `${basePath}?page=3`,
    );
  });

  it('특수 문자는 인코딩', () => {
    expect(buildAdminPageHref(basePath, { q: 'a&b c' }, 1)).toBe(
      `${basePath}?q=a%26b+c`,
    );
  });
});
