/**
 * i18n 공통 설정 (proxy / 서버 / 클라이언트 / lingui.config 에서 공유)
 * - 런타임 의존성이 없어야 하므로 Lingui CLI 나 서버 전용 모듈을 import 하지 않음
 */
export const LOCALES = ['ko', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

// 현재 UI 원문이 한국어이므로 한국어를 기본(원문) 로케일로 사용
export const DEFAULT_LOCALE: Locale = 'ko';

// 마지막으로 방문한 로케일 (로케일 없는 경로로 들어온 요청을 같은 언어로 보내기 위해 사용)
export const LOCALE_COOKIE = 'comdraft-locale';

// proxy 가 요청 경로의 로케일을 서버(Server Action 등 root params 를 못 쓰는 곳)로 전달하는 헤더
export const LOCALE_HEADER = 'x-comdraft-locale';

// 로케일 표기는 번역하지 않고 각 언어의 자기 이름으로 노출
export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
};

export const isLocale = (value: unknown): value is Locale => {
  return LOCALES.includes(value as Locale);
};

/**
 * 로케일 접두사를 붙인 경로 생성
 * @example localizePath('en', '/dashboard?status=installed') // '/en/dashboard?status=installed'
 */
export const localizePath = (locale: Locale, path: string) => {
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
};

// 로케일 접두사를 붙이면 안 되는 내부 경로 (proxy matcher 에서도 제외된 경로)
const NON_LOCALIZED_PREFIXES = ['/api', '/_next', '/_vercel'];

// public/ 정적 파일처럼 확장자가 있는 경로 (예: /logo.png)
const FILE_PATH_PATTERN = /\.[a-z0-9]+$/i;

const isLocalizablePathname = (pathname: string) => {
  // 같은 사이트의 절대 경로만 대상 (외부 URL, //cdn, 상대 경로, #hash, ?query, mailto: 등은 제외)
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    return false;
  }

  if (
    NON_LOCALIZED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }

  return !FILE_PATH_PATTERN.test(pathname);
};

interface LocalizeHrefOptions {
  // true: 이미 로케일 접두사가 있어도 지정한 로케일로 교체 (언어 전환 링크 등)
  // false: 이미 접두사가 있으면 의도한 링크로 보고 그대로 유지
  override?: boolean;
}

/**
 * 링크/라우터 이동 대상 href 에 로케일 접두사 적용
 * - 앱 내부 페이지 경로에만 접두사를 붙이고 쿼리/해시는 유지
 * - /api, 정적 파일, 외부 URL 은 그대로 반환
 * @example localizeHref('/dashboard?status=installed', 'en') // '/en/dashboard?status=installed'
 * @example localizeHref('/api/github/install', 'en') // '/api/github/install'
 * @example localizeHref('/ko/sign-in', 'en', { override: true }) // '/en/sign-in'
 */
export const localizeHref = (
  href: string,
  locale: Locale,
  { override = false }: LocalizeHrefOptions = {},
) => {
  const suffixIndex = href.search(/[?#]/);
  const pathname = suffixIndex === -1 ? href : href.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? '' : href.slice(suffixIndex);

  if (!isLocalizablePathname(pathname)) {
    return href;
  }

  const { locale: hrefLocale, path } = splitLocalePath(pathname);

  if (hrefLocale && !override) {
    return href;
  }

  return `${localizePath(locale, path)}${suffix}`;
};

/**
 * 경로의 첫 세그먼트가 지원 로케일이면 분리
 * @example splitLocalePath('/en/dashboard') // { locale: 'en', path: '/dashboard' }
 */
export const splitLocalePath = (pathname: string) => {
  const [, firstSegment = '', ...rest] = pathname.split('/');

  if (!isLocale(firstSegment)) {
    return { locale: null, path: pathname };
  }

  return { locale: firstSegment, path: `/${rest.join('/')}` };
};
