import Script from 'next/script';
import {
  getGoogleTagInitScript,
  getGoogleTagScriptUrl,
  shouldLoadGoogleTag,
} from '@/lib/analytics/google-tag';

/**
 * Google 태그 (Google Analytics 4 방문 분석)
 * - Google 이 안내한 스니펫 그대로: dataLayer 와 gtag 를 준비하고 측정 ID 로 설정, gtag.js 를 비동기로 불러옴
 * - 페이지가 상호작용 가능해진 뒤 불러와 첫 화면 표시를 늦추지 않음
 * - 화면 이동 집계는 GA 의 향상된 측정(브라우저 기록 변경 기준 페이지 조회)이 맡음
 */
const GoogleTag = () => {
  if (!shouldLoadGoogleTag(process.env.VERCEL_ENV)) {
    return null;
  }

  return (
    <>
      <Script id="google-tag-init" strategy="afterInteractive">
        {getGoogleTagInitScript()}
      </Script>
      <Script src={getGoogleTagScriptUrl()} strategy="afterInteractive" />
    </>
  );
};

export default GoogleTag;
