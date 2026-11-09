import 'server-only';
import type { GenerationRequest } from '@/lib/generation/contract';

/**
 * AI 작성 실행기 (작업을 비동기로 시작만 하고 바로 돌아옴)
 * - 실행기는 작업 상태(draft_prompt)를 직접 갱신하고 Realtime 신호를 보냄
 * - start 가 예외를 던지면 요청 액션이 작업을 runner_unavailable 로 실패 처리
 */
export interface GenerationRunner {
  start: (request: GenerationRequest) => Promise<void>;
}

// 실행기 선택 (GENERATION_RUNNER=fake|lambda, 기본 fake)
export type GenerationRunnerKind = 'fake' | 'lambda';

export const getGenerationRunnerKind = (
  value = process.env.GENERATION_RUNNER,
): GenerationRunnerKind => {
  return value === 'lambda' ? 'lambda' : 'fake';
};
