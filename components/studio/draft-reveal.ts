/**
 * AI 초안이 본문에 반영될 때의 등장 효과 (css/globals.css 의 [data-draft-reveal], .draft-sparkle)
 * - 본문 전체가 한 번에 페이드인
 * - 본문 위 여기저기서 작은 별이 반짝임 (화면에 보이는 높이 안에서만)
 * - 같은 요소에서 다시 재생할 수 있도록 속성과 반짝이 층을 지웠다가 다시 만들고, 끝나면 지움
 */

const FADE_DURATION_MS = 1400;
// 반짝이 하나의 재생 시간과 시작을 늦추는 범위
const SPARKLE_MIN_DURATION_MS = 900;
const SPARKLE_MAX_DURATION_MS = 1500;
const SPARKLE_MAX_DELAY_MS = 1400;
// 반짝이 개수: 면적에 비례, 상한·하한
const SPARKLE_AREA_PER_PARTICLE = 11_000;
const MIN_SPARKLES = 16;
const MAX_SPARKLES = 44;
// 브랜드 파랑을 중심으로 하늘색·보라·청록과 드문 금색을 섞어 반짝이마다 조금씩 다르게
const SPARKLE_COLORS = [
  'var(--color-brand)',
  'oklch(66% 0.19 262)',
  'oklch(74% 0.13 240)',
  'oklch(68% 0.17 290)',
  'oklch(80% 0.11 215)',
  'oklch(84% 0.14 85)',
];

const ATTRIBUTE = 'data-draft-reveal';
const LAYER_CLASS = 'draft-sparkles';

export interface SparkleSpec {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}

export const getDraftRevealDuration = () =>
  Math.max(FADE_DURATION_MS, SPARKLE_MAX_DELAY_MS + SPARKLE_MAX_DURATION_MS);

// 영역 안의 반짝이 위치·크기·시점 (random 은 0 이상 1 미만, 테스트에서 바꿔 끼움)
export const createSparkleSpecs = (
  width: number,
  height: number,
  random: () => number = Math.random,
): SparkleSpec[] => {
  if (width <= 0 || height <= 0) return [];

  const count = Math.min(
    MAX_SPARKLES,
    Math.max(
      MIN_SPARKLES,
      Math.round((width * height) / SPARKLE_AREA_PER_PARTICLE),
    ),
  );
  const between = (min: number, max: number) => min + (max - min) * random();

  return Array.from({ length: count }, () => ({
    x: Math.round(between(0, width)),
    y: Math.round(between(0, height)),
    size: Math.round(between(10, 22)),
    delay: Math.round(between(0, SPARKLE_MAX_DELAY_MS)),
    duration: Math.round(
      between(SPARKLE_MIN_DURATION_MS, SPARKLE_MAX_DURATION_MS),
    ),
    color: SPARKLE_COLORS[Math.floor(random() * SPARKLE_COLORS.length)],
  }));
};

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 화면에 보이는 높이 안에만 반짝이를 둠 (긴 글에서 보이지 않는 곳에 만들지 않음)
const createSparkleLayer = (container: HTMLElement) => {
  const rect = container.getBoundingClientRect();
  const visibleHeight = Math.min(rect.height, window.innerHeight);
  const layer = document.createElement('div');

  layer.className = LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');

  for (const spec of createSparkleSpecs(rect.width, visibleHeight)) {
    const sparkle = document.createElement('span');

    sparkle.className = 'draft-sparkle';
    sparkle.style.left = `${spec.x - spec.size / 2}px`;
    sparkle.style.top = `${spec.y - spec.size / 2}px`;
    sparkle.style.setProperty('--size', `${spec.size}px`);
    sparkle.style.setProperty('--delay', `${spec.delay}ms`);
    sparkle.style.setProperty('--duration', `${spec.duration}ms`);
    sparkle.style.setProperty('--color', spec.color);
    layer.append(sparkle);
  }

  return layer;
};

const timers = new WeakMap<HTMLElement, number>();

const clear = (container: HTMLElement) => {
  container.removeAttribute(ATTRIBUTE);
  container
    .querySelectorAll(`:scope > .${LAYER_CLASS}`)
    .forEach((layer) => layer.remove());
};

export const playDraftReveal = (container: HTMLElement) => {
  const previous = timers.get(container);
  if (previous !== undefined) window.clearTimeout(previous);

  clear(container);
  // 속성을 다시 달기 전에 스타일을 한 번 계산해 애니메이션을 처음부터 다시 시작
  void container.offsetWidth;
  container.setAttribute(ATTRIBUTE, '');

  if (!prefersReducedMotion()) {
    container.append(createSparkleLayer(container));
  }

  timers.set(
    container,
    window.setTimeout(() => {
      clear(container);
      timers.delete(container);
    }, getDraftRevealDuration() + 100),
  );
};
