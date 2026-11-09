import 'server-only';
import { AwsClient } from 'aws4fetch';
import type { GenerationRequest } from '@/lib/generation/contract';
import type { GenerationRunner } from '@/lib/generation/runner';

/**
 * API Gateway(REST, IAM 인증) → 작성 Lambda 비동기 호출 실행기
 * - 호출 전용 IAM 사용자(comdraft-generation-invoker) 키로 SigV4 서명한 POST 요청
 * - API Gateway 는 Lambda 를 비동기(Event)로 호출하고 바로 202 를 돌려줌 (진행 상황은 DB + Realtime 신호)
 * - 실패하면 예외를 던지고, 요청 액션이 작업을 runner_unavailable 로 실패 처리
 * - 요청 본문의 GitHub 토큰은 오류 메시지나 로그에 넣지 않음
 */

// API Gateway 응답 대기 시간 (비동기 호출이라 보통 바로 돌아옴)
const REQUEST_TIMEOUT_MS = 10_000;

export interface LambdaRunnerConfig {
  apiUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Vercel 이 AWS_ 로 시작하는 일부 이름을 예약하므로 GENERATION_ 접두사 사용
export const readLambdaRunnerConfig = (
  env: NodeJS.ProcessEnv = process.env,
): LambdaRunnerConfig => {
  const apiUrl = env.GENERATION_API_URL;
  const accessKeyId = env.GENERATION_AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.GENERATION_AWS_SECRET_ACCESS_KEY;

  if (!apiUrl || !accessKeyId || !secretAccessKey) {
    throw new Error(
      '작성 Lambda 호출 설정(GENERATION_API_URL, GENERATION_AWS_ACCESS_KEY_ID, GENERATION_AWS_SECRET_ACCESS_KEY)이 없습니다.',
    );
  }

  return {
    apiUrl,
    region: env.GENERATION_AWS_REGION ?? 'ap-northeast-2',
    accessKeyId,
    secretAccessKey,
  };
};

// 서명한 요청으로 작업 시작 (202 가 아니면 실패)
export const startLambdaJob = async (
  request: GenerationRequest,
  { apiUrl, region, accessKeyId, secretAccessKey }: LambdaRunnerConfig,
  fetchImpl?: typeof fetch,
) => {
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: 'execute-api',
  });

  const signed = await client.sign(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const response = await (fetchImpl ?? fetch)(signed, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (response.status !== 202) {
    throw new Error(`작성 Lambda 호출 실패 (${response.status})`);
  }
};

export const createLambdaRunner = (
  config: () => LambdaRunnerConfig = readLambdaRunnerConfig,
): GenerationRunner => ({
  start: (request) => startLambdaJob(request, config()),
});
