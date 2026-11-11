/**
 * AI 작성 요청 제한 (서버 검증과 화면 안내에서 공용)
 */

// 한 번에 보낼 수 있는 커밋 수 (Lambda 가 GitHub 에서 커밋 상세를 조회하는 양을 제한)
export const MAX_GENERATION_COMMITS = 20;

// 작성 요청 문구 최대 길이
export const MAX_GENERATION_PROMPT_LENGTH = 4000;

// 사용자당 1시간에 보낼 수 있는 작성 요청 수
export const GENERATION_HOURLY_LIMIT = 20;
export const GENERATION_RATE_WINDOW_MS = 60 * 60 * 1000;

// 빈칸 채우기 답 최대 길이 (앞뒤 공백을 지운 뒤 1자 이상)
export const MAX_BLANK_ANSWER_LENGTH = 1000;

// 빈칸 채우기 결과로 빈칸 자리에 넣는 문단 최대 개수
export const MAX_FILL_PARAGRAPHS = 3;
