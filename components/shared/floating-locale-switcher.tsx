'use client';

import LocaleSwitcher from '@/components/shared/locale-switcher';
import { useLocalizedPathname } from '@/hooks/use-localized-pathname';

/**
 * 화면 우측 상단에 고정된 언어 전환 링크
 * - 메인 페이지는 헤더에 언어 변경 버튼이 있어 헤더와 겹치지 않도록 숨김
 */
const FloatingLocaleSwitcher = () => {
  const path = useLocalizedPathname();

  if (path === '/') {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-10">
      <LocaleSwitcher />
    </div>
  );
};

export default FloatingLocaleSwitcher;
