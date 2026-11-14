import { describe, expect, it } from 'vitest';
import {
  GA_MEASUREMENT_ID,
  getGoogleTagInitScript,
  getGoogleTagScriptUrl,
  shouldLoadGoogleTag,
} from '@/lib/analytics/google-tag';

describe('shouldLoadGoogleTag', () => {
  it('Vercel 운영 배포에서만 불러온다 (로컬·미리 보기 방문은 세지 않음)', () => {
    expect(shouldLoadGoogleTag('production')).toBe(true);
    expect(shouldLoadGoogleTag('preview')).toBe(false);
    expect(shouldLoadGoogleTag('development')).toBe(false);
    expect(shouldLoadGoogleTag(undefined)).toBe(false);
  });
});

describe('Google 태그 (GA4 측정 ID)', () => {
  it('측정 ID 로 gtag.js 를 불러온다', () => {
    expect(GA_MEASUREMENT_ID).toBe('G-RBN7WKJY1V');
    expect(getGoogleTagScriptUrl()).toBe(
      'https://www.googletagmanager.com/gtag/js?id=G-RBN7WKJY1V',
    );
  });

  it('초기화 스크립트가 dataLayer 를 준비하고 측정 ID 로 config 한다', () => {
    const script = getGoogleTagInitScript();

    expect(script).toContain('window.dataLayer = window.dataLayer || [];');
    expect(script).toContain("gtag('js', new Date());");
    expect(script).toContain("gtag('config', 'G-RBN7WKJY1V');");
  });
});
