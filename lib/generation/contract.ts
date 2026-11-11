/**
 * AI 초안 작성 작업 계약 (Next.js ↔ 작성 Lambda 공용)
 * - Lambda 프로젝트는 이 파일의 요청 형식, Broadcast 이벤트, 오류 코드, 시간 제한을 그대로 따름
 * - 서버/클라이언트 공용이라 서버 전용 모듈을 import 하지 않음
 *
 * 흐름: Next.js 서버 액션 → API Gateway(IAM) → Lambda 비동기 실행
 *   Lambda 는 단계(구분 → 분석 → 작성)를 마칠 때마다 draft_prompt.step/status 를 갱신하고
 *   작업의 channel 로 Supabase Realtime Broadcast 를 보냄 (내용 없이 신호만)
 */

// 작업 상태 (lib/db/schema/draft.ts 의 draft_prompt.status 와 같은 값)
export type GenerationStatus = 'queued' | 'running' | 'completed' | 'failed';

// 작업 종류 (draft: 초안 작성, fill: 빈칸 하나를 AI 로 다듬기)
export const GENERATION_JOB_KINDS = ['draft', 'fill'] as const;
export type GenerationJobKind = (typeof GENERATION_JOB_KINDS)[number];

// 완료한 단계 (0: 시작 전, 1: 구분, 2: 분석, 3: 작성)
export const GENERATION_STEPS = [1, 2, 3] as const;
export type GenerationStep = 0 | (typeof GENERATION_STEPS)[number];

// Lambda 호출 요청 본문 (API Gateway → Lambda). 나머지 값은 Lambda 가 jobId 로 DB 에서 읽음
export interface GenerationRequest {
  jobId: string;
  // 사용자 GitHub 토큰 (커밋 상세 조회용, 저장하거나 로그에 남기지 않음)
  githubToken: string;
}

// Realtime Broadcast: 채널 이름은 draft_prompt.channel, 이벤트 이름은 고정
export const GENERATION_BROADCAST_EVENT = 'job-update';

// Broadcast 본문은 신호일 뿐이며, 받는 쪽은 상태 조회 API 로 실제 상태를 다시 읽어야 함
export interface GenerationBroadcastPayload {
  jobId: string;
  status: GenerationStatus;
  step: GenerationStep;
}

// 실패 사유 (draft_prompt.error_code)
export const GENERATION_ERROR_CODES = [
  // 시간 제한 초과 (Next.js 가 조회 시 판정)
  'timeout',
  // GitHub 토큰 만료/권한 없음 → 다시 로그인
  'github_reauth',
  // 저장소나 커밋에 접근할 수 없음
  'github_unavailable',
  // LLM 호출 실패
  'llm_failed',
  // 결과를 초안 문서로 바꾸지 못함
  'invalid_result',
  // 작성기(Lambda) 호출 실패
  'runner_unavailable',
  // 이번 요청이 남은 사용량보다 커서 시작하지 않음 (사용량 차감 없음)
  'quota_exceeded',
  // 그 밖의 오류
  'internal',
] as const;
export type GenerationErrorCode = (typeof GENERATION_ERROR_CODES)[number];

export const isGenerationErrorCode = (
  value: unknown,
): value is GenerationErrorCode => {
  return GENERATION_ERROR_CODES.includes(value as GenerationErrorCode);
};

// Lambda 실행 시간 제한 (Lambda 설정과 맞출 것)
export const GENERATION_LAMBDA_TIMEOUT_MS = 5 * 60 * 1000;

// running 상태가 이 시간을 넘기면 시간 초과 (Lambda 제한 + 여유)
export const GENERATION_RUNNING_TIMEOUT_MS =
  GENERATION_LAMBDA_TIMEOUT_MS + 60 * 1000;

// queued 상태로 Lambda 가 시작하지 않은 채 이 시간을 넘기면 시간 초과
export const GENERATION_QUEUED_TIMEOUT_MS = 60 * 1000;
