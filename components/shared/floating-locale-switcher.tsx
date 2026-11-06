'use client';

import LocaleSwitcher from '@/components/shared/locale-switcher';
import { useLocalizedPathname } from '@/hooks/use-localized-pathname';

// 메인: 헤더의 언어 변경 버튼과 겹침, 회원가입/로그인 · 온보딩: 디자인에 언어 전환이 없음
const HIDDEN_PATHS = new Set(['/', '/sign-in', '/onboarding']);

// 화면 우측 상단에 고정된 언어 전환 링크
const FloatingLocaleSwitcher = () => {
  const path = useLocalizedPathname();

  if (HIDDEN_PATHS.has(path)) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-10">
      <LocaleSwitcher />
    </div>
  );
};

export default FloatingLocaleSwitcher;
