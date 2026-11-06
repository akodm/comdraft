'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { setupI18n, type Messages } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { LOCALE_COOKIE } from '@/lib/i18n/config';

interface LinguiClientProviderProps {
  children: React.ReactNode;
  initialLocale: string;
  initialMessages: Messages;
}

/**
 * Client Component 용 i18n 컨텍스트
 * - I18n 인스턴스는 직렬화할 수 없으므로 서버(root layout)에서 로케일과 메시지만 넘겨받아 클라이언트에서 생성
 * - 로케일 전환은 URL 의 로케일 세그먼트를 바꾸는 방식이라, 레이아웃이 다시 렌더링되며 새 provider 가 마운트됨
 * - 실제로 화면에 렌더링된 로케일을 "마지막 방문 로케일" 쿠키로 기록
 *   - prefetch 는 렌더링되지 않으므로 쿠키를 바꾸지 않음 (proxy / Route Handler 는 이 쿠키를 읽기만 함)
 *   - 같은 로케일 안에서 이동할 때도 다시 기록 → 언어가 다른 탭이 여러 개면 마지막으로 이동한 탭 기준
 */
const LinguiClientProvider = ({
  children,
  initialLocale,
  initialMessages,
}: LinguiClientProviderProps) => {
  const [i18n] = useState(() =>
    setupI18n({
      locale: initialLocale,
      messages: { [initialLocale]: initialMessages },
    }),
  );

  const pathname = usePathname();

  useEffect(() => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';

    document.cookie = `${LOCALE_COOKIE}=${initialLocale}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  }, [initialLocale, pathname]);

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
};

export default LinguiClientProvider;
