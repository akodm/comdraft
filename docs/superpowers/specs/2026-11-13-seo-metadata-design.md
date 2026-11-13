# SEO 메타데이터, 오픈그래프 이미지, robots, 사이트맵 갱신 설계

## 의도

기본 페이지가 완성되어 검색·공유에 보이는 정보를 갖춘다. 핵심 메시지:
AI 로 기술 개발 블로그 초안을 빠르게 작성하고, 편집기에서 다듬어 게시·공유한다.
GitHub API 로 커밋 내역을 골라 초안의 디테일을 채우며, AI 로 PR·커밋을 올리는 환경일수록 초안이 좋아진다.

## 범위

- 검색 노출 페이지(언어별로 자세히): 메인 `/{lang}`, 게시글 목록 `/{lang}/posts`, 게시글 상세 `/{lang}/posts/{slug}-{id}`
- 검색 제외 페이지(짧은 제목 + noindex): 로그인, 온보딩, 대시보드·스튜디오
- 오픈그래프 이미지: 사이트 기본(언어별), 게시글별(제목·작성자·태그)
- robots, 사이트맵 갱신, 주간 Vercel Cron

## 결정 (사용자 승인: 사이트맵 방식 A)

- 사이트맵은 캐시해 두고 게시·다시 게시·게시 취소 때 바로 다시 만들며, 일요일 0시(한국 시간) Vercel Cron 이 한 번 더 전체를 다시 만든다 (`0 15 * * 6`, UTC)
  - Google 사이트맵 ping 은 2023년에 폐지되어 크론은 캐시 갱신만 한다
  - 게시글 수정은 다시 게시할 때 `post.updated_at` 이 바뀌어 `lastModified` 로 반영
- 크론 경로 `/api/cron/sitemap` 은 `Authorization: Bearer ${CRON_SECRET}` 일 때만 실행 (Vercel 이 자동으로 붙임)

## Claude 가 정한 것

- 문구는 실제 기능에 맞춤: 다른 블로그에 직접 올리지 않고 HTML·Markdown 내보내기로 "여러 블로그에 공유"
- 제목 형식 `{페이지 제목} | comdraft`, 메인은 전체 제목. `metadataBase` 는 `BETTER_AUTH_URL`
- 메인·목록은 `hreflang`(ko, en, x-default → `/`) 대표 주소, 목록 2쪽부터는 `?page=N` 이 대표 주소
- 게시글 상세: 모아 둔 기술 태그를 `keywords`·`article:tag` 로, `BlogPosting` JSON-LD, 일부 공개 글은 기존처럼 noindex
- 메인에 `WebSite` JSON-LD
- robots: `/api/`, `/*/dashboard`, `/*/onboarding`, `/*/sign-in` 차단, 사이트맵 주소 표기. `public/robots.txt` 는 `app/robots.ts` 로 대체
- 오픈그래프 이미지 한글 글꼴: 이미지 생성 때 Google Fonts 에서 필요한 글자만 받아 씀 (실패하면 글꼴 없이 생성)
- 트위터 카드 `summary_large_image`
