import { msg } from '@lingui/core/macro';
/**
 * 검색·공유에 보이는 사이트 문구 (언어별 번역은 locales/*.po)
 * - 핵심: AI 로 기술 개발 블로그 초안을 빠르게 작성, 에디터로 다듬어 게시·공유,
 *   GitHub 커밋 내역을 골라 초안의 디테일을 채움, AI 로 커밋·PR 을 올리는 환경일수록 좋은 초안
 * - 다른 블로그에 직접 올리지 않으므로 "내보내서 여러 블로그에 공유" 로 표현
 */
export const SITE_TITLE = msg`comdraft — 커밋으로 쓰는 AI 기술 블로그 초안`;

export const SITE_DESCRIPTION = msg`GitHub 커밋과 PR 을 골라 AI 가 기술 개발 블로그 초안을 빠르게 작성합니다. 에디터에서 바로 다듬어 게시하고, HTML·Markdown 으로 내보내 여러 블로그에 공유하세요. AI 와 함께 커밋과 PR 을 올리는 개발 환경일수록 더 자세한 초안이 만들어집니다.`;

export const POSTS_TITLE = msg`개발 블로그 게시글`;

export const POSTS_DESCRIPTION = msg`comdraft 로 작성한 기술 개발 블로그 글을 최신순으로 모았습니다. 실제 커밋과 코드 변경을 바탕으로 쓴 개발 경험을 읽어 보세요.`;

// 오픈그래프 이미지의 한 줄 소개와 기능 요약
export const OG_TAGLINE = msg`커밋으로 쓰는 AI 기술 블로그 초안`;

export const OG_FEATURES = msg`커밋 선택 · AI 초안 작성 · 에디터 수정 · 게시와 공유`;

export const OG_IMAGE_ALT = msg`comdraft — GitHub 커밋으로 AI 기술 블로그 초안을 작성하는 서비스`;

// 검색에서 빼는 화면의 짧은 제목
export const SIGN_IN_TITLE = msg`로그인`;

export const ONBOARDING_TITLE = msg`시작하기`;

export const DASHBOARD_TITLE = msg`대시보드`;
