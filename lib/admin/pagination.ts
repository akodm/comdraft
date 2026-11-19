// 어드민 목록 쪽 나눔 계산 (서버/클라이언트 어디서든 테스트할 수 있도록 server-only, DB, Lingui 를 import 하지 않는다)

// 어드민 목록 한 쪽의 행 수
export const ADMIN_PAGE_SIZE = 50;

/**
 * 전체 쪽 수 (행이 없어도 1쪽)
 * @example getAdminTotalPages(101, 50) // 3
 */
export const getAdminTotalPages = (total: number, pageSize: number): number =>
  Math.max(1, Math.ceil(total / pageSize));

/**
 * 목록의 특정 쪽 주소 (검색어 등 쿼리는 유지, 빈 값은 빼고 1쪽은 page 를 붙이지 않음)
 * @example buildAdminPageHref('/ko/admin/key/users', { q: 'kim' }, 2) // '/ko/admin/key/users?q=kim&page=2'
 */
export const buildAdminPageHref = (
  basePath: string,
  query: Record<string, string>,
  page: number,
): string => {
  const params = new URLSearchParams();

  for (const [name, value] of Object.entries(query)) {
    if (name !== 'page' && value !== '') {
      params.set(name, value);
    }
  }

  if (page > 1) {
    params.set('page', String(page));
  }

  const search = params.toString();

  return search ? `${basePath}?${search}` : basePath;
};
