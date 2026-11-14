import { describe, expect, it } from 'vitest';
import { PRIVACY_POLICY } from '@/lib/legal/privacy-policy';
import { TERMS_OF_SERVICE } from '@/lib/legal/terms-of-service';
import { CONTACT_EMAIL, getContactMailto } from '@/lib/site/contact';

describe.each([
  ['개인정보처리방침', PRIVACY_POLICY],
  ['이용약관', TERMS_OF_SERVICE],
])('%s', (_name, doc) => {
  it('한국어·영어가 같은 시행일과 같은 수의 조항을 갖는다', () => {
    expect(doc.en.effectiveDate).toBe(doc.ko.effectiveDate);
    expect(doc.en.sections).toHaveLength(doc.ko.sections.length);
  });

  it('언어마다 제목이 있고 조항마다 제목과 내용이 있다', () => {
    for (const locale of ['ko', 'en'] as const) {
      expect(doc[locale].title).not.toBe('');
      for (const section of doc[locale].sections) {
        expect(section.heading).not.toBe('');
        expect(
          (section.paragraphs?.length ?? 0) + (section.items?.length ?? 0),
        ).toBeGreaterThan(0);
      }
    }
  });

  it('마지막 조항은 운영자 이메일 문의처', () => {
    for (const locale of ['ko', 'en'] as const) {
      expect(doc[locale].sections.at(-1)?.contact).toBe(true);
    }
  });
});

describe('개인정보처리방침 내용', () => {
  it('제3자 AI(Anthropic)로의 국외 전송을 알린다', () => {
    const text = JSON.stringify(PRIVACY_POLICY.ko);

    expect(text).toContain('Anthropic');
    expect(text).toContain('미국');
    expect(JSON.stringify(PRIVACY_POLICY.en)).toContain('Anthropic');
  });
});

describe('개인정보처리방침 Google Analytics 안내', () => {
  it('두 언어 모두 Google Analytics 위탁과 쿠키, 거부 방법을 알린다', () => {
    for (const locale of ['ko', 'en'] as const) {
      const text = JSON.stringify(PRIVACY_POLICY[locale]);

      expect(text).toContain('Google Analytics');
      expect(text).toContain('_ga');
      expect(text).toContain('https://tools.google.com/dlpage/gaoptout');
    }
  });
});

describe('getContactMailto', () => {
  it('운영자 이메일로 제목을 인코딩해 연결', () => {
    expect(getContactMailto('[comdraft] 문의')).toBe(
      `mailto:${CONTACT_EMAIL}?subject=%5Bcomdraft%5D%20%EB%AC%B8%EC%9D%98`,
    );
  });
});
