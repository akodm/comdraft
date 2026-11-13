import type { Locale } from '@/lib/i18n/config';

// 약관·방침의 한 조항 (문단과 항목 목록, 마지막 문의처 조항은 운영자 이메일 링크를 붙임)
export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  contact?: boolean;
}

// 언어 하나의 약관·방침 문서 (제목은 화면의 H1)
export interface LegalDocument {
  title: string;
  // 시행일 (YYYY-MM-DD, 언어마다 같은 날)
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
}

// 장문 법률 문서는 번역 카탈로그 대신 언어별 원문을 그대로 둠 (조항 구조를 언어 간에 맞춰 관리)
export type LocalizedLegalDocument = Record<Locale, LegalDocument>;
