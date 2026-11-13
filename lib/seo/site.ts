import type { Locale } from '@/lib/i18n/config';

// 서비스 이름 (고유명사라 번역하지 않음)
export const SITE_NAME = 'comdraft';

// 검색 키워드 (번역 문장이 아니라 언어별 검색어 목록)
export const SITE_KEYWORDS: Record<Locale, string[]> = {
  ko: [
    '기술 블로그',
    '개발 블로그',
    'AI 블로그 초안',
    'AI 글쓰기',
    'GitHub 커밋',
    '커밋 내역',
    'Pull Request',
    '개발 회고',
    'Markdown 에디터',
    'comdraft',
  ],
  en: [
    'tech blog',
    'developer blog',
    'AI blog draft',
    'AI writing',
    'GitHub commits',
    'commit history',
    'pull request',
    'dev retrospective',
    'Markdown editor',
    'comdraft',
  ],
};

// 오픈그래프 로케일 표기
export const OG_LOCALES: Record<Locale, string> = {
  ko: 'ko_KR',
  en: 'en_US',
};

// 로그인이 필요하거나 검색에 보일 필요가 없는 화면 (로그인, 온보딩, 대시보드·스튜디오)
export const NOINDEX = { index: false, follow: false } as const;
