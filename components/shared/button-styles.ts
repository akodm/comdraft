// 폭을 꽉 채우는 52px 버튼 (회원가입/로그인, 온보딩)
const FULL_BUTTON_CLASS =
  'flex h-13 w-full items-center justify-center gap-2.5 rounded px-5.5 text-[14px] leading-[1.2] font-bold whitespace-nowrap pc:text-[15px]';

export const GITHUB_BUTTON_CLASS = `${FULL_BUTTON_CLASS} border border-ink bg-ink text-white`;

// 처리 중(aria-busy)에는 비활성이어도 기본 색 유지
export const PRIMARY_BUTTON_CLASS = `${FULL_BUTTON_CLASS} bg-brand text-white disabled:not-aria-busy:bg-disabled disabled:not-aria-busy:text-ink-subtle`;
