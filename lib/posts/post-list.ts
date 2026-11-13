// 게시글 목록 쪽 번호 계산 (서버/클라이언트 어디서든 테스트할 수 있도록 server-only, DB, Lingui 를 import 하지 않는다)

// 한 쪽에 보여 주는 게시글 수
export const POST_LIST_PAGE_SIZE = 30;

const PAGE_PATTERN = /^[1-9]\d*$/;

/**
 * 주소의 page 값을 쪽 번호로 (양의 정수가 아니면 1쪽, 여러 번 오면 첫 값 기준)
 * @example parsePageParam('3') // 3
 * @example parsePageParam('abc') // 1
 */
export const parsePageParam = (
  value: string | string[] | undefined,
): number => {
  const first = Array.isArray(value) ? value[0] : value;

  return first !== undefined && PAGE_PATTERN.test(first) ? Number(first) : 1;
};

/**
 * 페이지네이션에 보여 줄 번호 (첫·마지막 쪽, 현재 쪽 앞뒤 siblings 개, 건너뛰는 구간은 'gap')
 * - 건너뛰는 쪽이 하나뿐이면 'gap' 대신 그 번호를 보여 줌
 * - 1쪽뿐이면 빈 배열
 * @example getPaginationItems(10, 20, 2) // [1, 'gap', 8, 9, 10, 11, 12, 'gap', 20]
 */
export const getPaginationItems = (
  current: number,
  totalPages: number,
  siblings: number,
): Array<number | 'gap'> => {
  if (totalPages <= 1) {
    return [];
  }

  const pages = new Set([1, totalPages]);

  for (let page = current - siblings; page <= current + siblings; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pages.add(page);
    }
  }

  const items: Array<number | 'gap'> = [];
  let previous = 0;

  for (const page of [...pages].sort((a, b) => a - b)) {
    if (page - previous === 2) {
      items.push(previous + 1);
    } else if (page - previous > 2) {
      items.push('gap');
    }

    items.push(page);
    previous = page;
  }

  return items;
};

/**
 * 목록 쪽 주소 (1쪽은 쿼리 없이)
 * @example getPostListHref(4) // '/posts?page=4'
 */
export const getPostListHref = (page: number) =>
  page <= 1 ? '/posts' : `/posts?page=${page}`;
