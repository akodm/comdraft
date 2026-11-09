import 'server-only';
import type { GenerationRunner } from '@/lib/generation/runner';

/**
 * [준비 중] API Gateway(REST, IAM 인증) → 작성 Lambda 비동기 호출 실행기
 * - 구현 예정: SigV4 로 서명한 POST 요청에 GenerationRequest({ jobId, githubToken }) 를 실어 보내고,
 *   API Gateway 는 Lambda 를 비동기(Event)로 호출해 바로 202 를 돌려줌
 * - 지금은 호출할 대상이 없으므로 시작하지 못한 것으로 처리 (작업은 runner_unavailable 로 실패)
 */
export const createLambdaRunner = (): GenerationRunner => ({
  start: async () => {
    throw new Error('작성 Lambda 실행기가 아직 연결되지 않았습니다.');
  },
});
