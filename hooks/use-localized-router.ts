import { useMemo } from 'react';
// 로케일 처리를 위해 이 파일에서만 useRouter 를 직접 사용 (나머지는 eslint 로 제한)
// eslint-disable-next-line no-restricted-imports
import { useRouter } from 'next/navigation';
import { useLocale } from '@/hooks/use-locale';
import { localizeHref, type Locale } from '@/lib/i18n/config';

type AppRouter = ReturnType<typeof useRouter>;
type NavigateOptions = NonNullable<Parameters<AppRouter['push']>[1]>;
type PrefetchOptions = NonNullable<Parameters<AppRouter['prefetch']>[1]>;

interface LocaleOption {
  // 지정하면 해당 로케일로 이동 (이미 접두사가 있는 href 도 교체), 생략하면 현재 로케일 유지
  locale?: Locale;
}

/**
 * 현재 로케일을 유지하는 useRouter
 * - push / replace / prefetch 의 href 는 로케일 접두사 없이 작성 (`/sign-in` → `/ko/sign-in`)
 * - back / forward / refresh 는 next/navigation 의 router 그대로
 * @example
 * const router = useLocalizedRouter();
 * router.push('/dashboard');
 * router.replace('/sign-in', { locale: 'en' });
 */
export const useLocalizedRouter = () => {
  const router = useRouter();
  const currentLocale = useLocale();

  return useMemo(() => {
    const localize = (href: string, locale?: Locale) =>
      localizeHref(href, locale ?? currentLocale, {
        override: locale !== undefined,
      });

    return {
      ...router,
      push: (
        href: string,
        { locale, ...options }: NavigateOptions & LocaleOption = {},
      ) => router.push(localize(href, locale), options),
      replace: (
        href: string,
        { locale, ...options }: NavigateOptions & LocaleOption = {},
      ) => router.replace(localize(href, locale), options),
      // next 의 PrefetchOptions 는 kind 가 필수라 옵션이 있을 때만 전달
      prefetch: (href: string, options?: PrefetchOptions & LocaleOption) => {
        if (!options) {
          return router.prefetch(localize(href));
        }

        const { locale, ...prefetchOptions } = options;

        return router.prefetch(localize(href, locale), prefetchOptions);
      },
    };
  }, [router, currentLocale]);
};
