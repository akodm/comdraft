/**
 * 초안 작성 스튜디오 공통 스타일
 */

// 사이드바: PC 는 항상 보이는 고정 열, 모바일은 왼쪽에서 열리는 패널 (닫혀 있으면 화면 밖 + 포커스 불가)
export const getSidebarClass = (isOpen: boolean) =>
  `fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-panel transition-[translate,visibility] duration-200 pc:visible pc:static pc:z-auto pc:translate-x-0 pc:transition-none ${
    isOpen ? 'translate-x-0' : 'invisible -translate-x-full'
  }`;

// 사이드바 목록의 얇은 스크롤바 (디자인의 3px 스크롤 핸들)
export const THIN_SCROLL_CLASS =
  'overflow-y-auto [scrollbar-color:var(--color-scroll-thumb)_var(--color-surface)] [scrollbar-width:thin]';

// 테두리 있는 흰색 작업 버튼 (HTML, MD, 참고 링크 추가)
export const OUTLINE_BUTTON_CLASS =
  'flex items-center justify-center gap-2 rounded border border-line bg-white px-3.5 whitespace-nowrap text-ink disabled:text-ink-subtle';

// 파란색 작업 버튼 (게시하기, 제출)
export const BRAND_BUTTON_CLASS =
  'flex items-center justify-center gap-2 rounded border border-brand bg-brand px-3.5 text-[12px] leading-[normal] font-medium whitespace-nowrap text-white disabled:opacity-50';

// 아이콘만 있는 투명 버튼 (편집 도구, 닫기, 외부 링크)
export const ICON_BUTTON_CLASS =
  'flex shrink-0 items-center justify-center rounded hover:bg-surface focus-visible:bg-surface disabled:opacity-40 disabled:hover:bg-transparent';

// PC 레이아웃 미디어 쿼리 (css/globals.css 의 --breakpoint-pc: 1320px 과 같은 값)
export const PC_MEDIA_QUERY = '(min-width: 1320px)';
