import 'server-only';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { permanentRedirect, redirect } from 'next/navigation';
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  LOCALES,
  localizePath,
  type Locale,
} from '@/lib/i18n/config';

/**
 * 현재 요청의 로케일 (Server Component / Server Action / Route Handler 공용)
 * - next/root-params 는 Server Action, Route Handler 에서 쓸 수 없으므로 헤더/쿠키로 판별
 * 1. proxy 가 요청 경로에서 읽어 넣어준 헤더 (페이지 요청과 해당 페이지의 Server Action POST)
 * 2. 마지막으로 방문한 로케일 쿠키 (proxy 를 거치지 않는 /api 라우트)
 * 3. 기본 로케일
 */
export const getRequestLocale = async (): Promise<Locale> => {
  const headerLocale = (await headers()).get(LOCALE_HEADER);

  if (isLocale(headerLocale)) {
    return headerLocale;
  }

  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;

  return isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
};

/**
 * 현재 요청 로케일의 경로로 리다이렉트 (Server Component / Server Action 공용)
 * @example await localizedRedirect('/dashboard') // → /ko/dashboard
 */
export const localizedRedirect = async (path: string): Promise<never> => {
  redirect(localizePath(await getRequestLocale(), path));
};

/**
 * 현재 요청 로케일의 경로로 영구 리다이렉트 (308, 주소가 바뀐 페이지의 예전 주소 처리용)
 * @example await localizedPermanentRedirect('/posts/new-slug-id') // → /ko/posts/new-slug-id
 */
export const localizedPermanentRedirect = async (
  path: string,
): Promise<never> => {
  permanentRedirect(localizePath(await getRequestLocale(), path));
};

// 모든 로케일의 같은 경로 캐시 무효화 (다른 언어 탭/세션에서도 최신 데이터가 보이도록)
export const revalidateLocalizedPath = (path: string) => {
  for (const locale of LOCALES) {
    revalidatePath(localizePath(locale, path));
  }
};
