import type { GenerationModel } from '@/lib/generation/contract';

// 등급별로 쓸 수 있는 모델 (낮은 모델부터). 모르는 등급은 haiku 만
export const ROLE_MODELS: Record<string, GenerationModel[]> = {
  basic: ['haiku'],
  pro: ['haiku', 'sonnet'],
  max: ['haiku', 'sonnet', 'opus'],
};

const FALLBACK_MODELS: GenerationModel[] = ['haiku'];

export const getAllowedModels = (
  role: string | null | undefined,
): GenerationModel[] => {
  return (role ? ROLE_MODELS[role] : undefined) ?? FALLBACK_MODELS;
};

export const isModelAllowed = (
  role: string | null | undefined,
  model: GenerationModel,
): boolean => {
  return getAllowedModels(role).includes(model);
};

// 쓸 수 없는 모델이면 허용 목록의 가장 높은 모델로 낮춤
export const clampModel = (
  role: string | null | undefined,
  model: GenerationModel,
): GenerationModel => {
  if (isModelAllowed(role, model)) {
    return model;
  }

  const allowed = getAllowedModels(role);

  return allowed[allowed.length - 1];
};

// 화면에 보이는 모델별 사용량 배율 (haiku 기준, 실측으로 맞출 시작 값)
export const MODEL_USAGE_RATIO: Record<GenerationModel, number> = {
  haiku: 1,
  sonnet: 10,
  opus: 20,
};

export interface UsageTokens {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

// 단가: 마이크로달러 / 100만 토큰 (= 달러 / 100만 토큰 × 1,000,000). 정수로 두어 합산 오차를 막음
interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export const MODEL_PRICES: {
  haiku: { base: Price; long: Price };
  sonnet: Price;
  opus: Price;
} = {
  haiku: {
    base: {
      input: 100_000,
      output: 500_000,
      cacheWrite: 125_000,
      cacheRead: 10_000,
    },
    // 프롬프트가 HAIKU_LONG_PROMPT_TOKENS 를 넘는 호출
    long: {
      input: 500_000,
      output: 2_500_000,
      cacheWrite: 625_000,
      cacheRead: 50_000,
    },
  },
  sonnet: {
    input: 2_000_000,
    output: 10_000_000,
    cacheWrite: 2_500_000,
    cacheRead: 100_000,
  },
  opus: {
    input: 4_000_000,
    output: 20_000_000,
    cacheWrite: 5_000_000,
    cacheRead: 200_000,
  },
};

// haiku 는 프롬프트(입력 + 캐시 쓰기 + 캐시 읽기)가 이 값을 넘는 호출만 long 단가
export const HAIKU_LONG_PROMPT_TOKENS = 100_000;

const priceOf = (model: GenerationModel, usage: UsageTokens): Price => {
  if (model !== 'haiku') {
    return MODEL_PRICES[model];
  }

  const prompt = usage.input + usage.cacheWrite + usage.cacheRead;

  return prompt > HAIKU_LONG_PROMPT_TOKENS
    ? MODEL_PRICES.haiku.long
    : MODEL_PRICES.haiku.base;
};

// 호출 하나의 비용 (마이크로달러, 올림)
export const usageCost = (
  model: GenerationModel,
  usage: UsageTokens,
): number => {
  const price = priceOf(model, usage);
  const scaled =
    usage.input * price.input +
    usage.output * price.output +
    usage.cacheWrite * price.cacheWrite +
    usage.cacheRead * price.cacheRead;

  return Math.ceil(scaled / 1_000_000);
};
