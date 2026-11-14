/**
 * Google 태그(Google Analytics 4) 설정
 * - GA4 측정 ID 로 gtag.js 를 불러와 측정 (페이지 소스에 공개되는 값)
 * - 운영 배포(Vercel production)에서만 불러와 로컬·미리 보기 방문이 통계에 섞이지 않게 함
 */
export const GA_MEASUREMENT_ID = 'G-RBN7WKJY1V';

export const shouldLoadGoogleTag = (vercelEnv: string | undefined) =>
  vercelEnv === 'production';

export const getGoogleTagScriptUrl = () =>
  `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

// Google 이 안내하는 초기화 스크립트 (dataLayer·gtag 준비 후 측정 ID 로 설정)
export const getGoogleTagInitScript = () =>
  `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`;
