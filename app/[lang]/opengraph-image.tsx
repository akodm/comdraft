// 사이트 기본 오픈그래프 이미지 (언어별 문구, lib/seo/site-og-image-route)
export { alt, contentType, default, size } from '@/lib/seo/site-og-image-route';

// 언어별 문구만 쓰는 고정 이미지라 빌드 때 한 번 만듦 (요청마다 글꼴을 받지 않도록)
export const dynamic = 'force-static';
