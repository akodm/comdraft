// 운영자 연락처 (푸터의 개발자 이메일·문의하기, 개인정보처리방침·이용약관의 문의처)
export const CONTACT_EMAIL = 'a8456452@gmail.com';

// 문의 메일 링크 (메일 앱이 열리며 제목을 미리 채움)
export const getContactMailto = (subject: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
