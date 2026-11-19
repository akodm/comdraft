/**
 * 어드민 화면 공통 스타일
 */

// 화면 제목 (콘솔 본문, 로그인·비밀번호 변경 카드)
export const ADMIN_TITLE_CLASS =
  'text-[20px] leading-[1.4] font-bold tracking-[-0.5px] text-ink';

// 입력 칸 위 이름
export const ADMIN_LABEL_CLASS =
  'text-[13px] leading-[1.4] font-medium text-ink';

// 한 줄 입력 칸
export const ADMIN_INPUT_CLASS =
  'h-10 w-full border border-line bg-white px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-brand';

// 여러 줄 입력 칸 (조치 사유)
export const ADMIN_TEXTAREA_CLASS =
  'w-full resize-y border border-line bg-white px-3 py-2 text-[13px] leading-[1.6] text-ink outline-none transition-colors focus:border-brand';

// 폼 아래 오류 문구
export const ADMIN_ERROR_CLASS =
  'text-[13px] leading-[1.6] break-keep text-danger';
