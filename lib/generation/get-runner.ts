import 'server-only';
import { createFakeRunner } from '@/lib/generation/fake-runner';
import { createLambdaRunner } from '@/lib/generation/lambda-runner';
import {
  getGenerationRunnerKind,
  type GenerationRunner,
} from '@/lib/generation/runner';

// 환경 변수(GENERATION_RUNNER)로 고른 실행기
export const getGenerationRunner = (
  kind = getGenerationRunnerKind(),
): GenerationRunner => {
  return kind === 'lambda' ? createLambdaRunner() : createFakeRunner();
};
