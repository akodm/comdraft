'use client';

import LocaleSwitcher from '@/components/shared/locale-switcher';
import { useLocalizedPathname } from '@/hooks/use-localized-pathname';

// 메인 · 대시보드: 헤더의 언어 변경 버튼과 겹침
// 회원가입/로그인 · 온보딩 · 저장소 추가(온보딩 화면 재사용): 디자인에 언어 전환이 없음
const HIDDEN_PATHS = new Set([
  '/',
  '/sign-in',
  '/onboarding',
  '/dashboard',
  '/dashboard/repositories',
]);

// 초안 작성 스튜디오: 사이드바에 언어 선택이 있음
const STUDIO_PATH_PATTERN = /^\/dashboard\/repositories\/[^/]+\/drafts(\/|$)/;

// 게시글 목록 · 상세: 메인 헤더의 언어 변경 버튼과 겹침
const POSTS_PATH_PATTERN = /^\/posts(\/|$)/;

// 화면 우측 상단에 고정된 언어 전환 링크
const FloatingLocaleSwitcher = () => {
  const path = useLocalizedPathname();

  if (
    HIDDEN_PATHS.has(path) ||
    STUDIO_PATH_PATTERN.test(path) ||
    POSTS_PATH_PATTERN.test(path)
  ) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-10">
      <LocaleSwitcher />
    </div>
  );
};

export default FloatingLocaleSwitcher;
