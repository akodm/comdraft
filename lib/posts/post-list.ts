// 게시글 목록 쪽 번호·필터 계산 (서버/클라이언트 어디서든 테스트할 수 있도록 server-only, DB, Lingui 를 import 하지 않는다)

import { isLocale, type Locale } from '@/lib/i18n/config';

// 한 쪽에 보여 주는 게시글 수
export const POST_LIST_PAGE_SIZE = 30;

// 주소로 받을 수 있는 가장 큰 쪽 (DB offset 이 bigint 범위·지수 표기로 넘어가지 않게, 실제 글 수보다 충분히 큼)
export const MAX_PAGE = 1_000_000_000;

const PAGE_PATTERN = /^[1-9]\d*$/;

/**
 * 주소의 page 값을 쪽 번호로 (양의 정수가 아니면 1쪽, 여러 번 오면 첫 값 기준, MAX_PAGE 를 넘으면 MAX_PAGE)
 * @example parsePageParam('3') // 3
 * @example parsePageParam('abc') // 1
 */
export const parsePageParam = (
  value: string | string[] | undefined,
): number => {
  const first = Array.isArray(value) ? value[0] : value;

  if (first === undefined || !PAGE_PATTERN.test(first)) {
    return 1;
  }

  // 너무 큰 값은 최대 쪽으로 (마지막 쪽보다 커서 404)
  return Math.min(Number(first), MAX_PAGE);
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
 * 게시글 목록 필터 (주소의 검색 파라미터로 표현, 값이 null 이면 걸지 않음)
 * - 필터를 늘릴 때는 여기에 항목을 더하고 parsePostListFilters·getPostListHref 에 파라미터를 추가
 */
export interface PostListFilters {
  // 게시할 때의 언어 (post.locale), null 이면 전체
  language: Locale | null;
}

// 필터를 걸지 않은 상태 (기본값)
export const EMPTY_POST_LIST_FILTERS: PostListFilters = { language: null };

// 언어 필터 검색 파라미터 이름 (화면 언어인 경로의 [lang] 과 구분)
export const LANGUAGE_PARAM = 'language';

type SearchParamValue = string | string[] | undefined;

/**
 * 주소의 검색 파라미터를 목록 필터로 (지원하지 않는 값은 걸지 않은 것으로, 여러 번 오면 첫 값 기준)
 * @example parsePostListFilters({ language: 'en' }) // { language: 'en' }
 * @example parsePostListFilters({ language: 'fr' }) // { language: null }
 */
export const parsePostListFilters = (
  searchParams: Record<string, SearchParamValue>,
): PostListFilters => {
  const value = searchParams[LANGUAGE_PARAM];
  const language = Array.isArray(value) ? value[0] : value;

  return { language: isLocale(language) ? language : null };
};

/** 걸린 필터가 하나라도 있는지 (검색 노출, 빈 목록 문구 판단용) */
export const hasActivePostListFilters = (filters: PostListFilters) =>
  filters.language !== null;

/**
 * 목록 쪽 주소 (걸린 필터를 유지, 1쪽은 page 쿼리 없이)
 * @example getPostListHref(4) // '/posts?page=4'
 * @example getPostListHref(2, { language: 'en' }) // '/posts?language=en&page=2'
 */
export const getPostListHref = (
  page: number,
  filters: PostListFilters = EMPTY_POST_LIST_FILTERS,
) => {
  const params = new URLSearchParams();

  if (filters.language) {
    params.set(LANGUAGE_PARAM, filters.language);
  }

  if (page > 1) {
    params.set('page', String(page));
  }

  const query = params.toString();

  return query ? `/posts?${query}` : '/posts';
};
