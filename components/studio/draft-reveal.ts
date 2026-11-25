/**
 * AI 결과가 본문에 반영될 때의 등장 효과 (css/globals.css 의 [data-draft-reveal], .draft-sparkle)
 * - 초안 작성: 본문 전체가 한 번에 페이드인, 본문 위 여기저기서 작은 별이 반짝임 (화면에 보이는 높이 안에서만)
 * - 빈칸 채우기: 빈칸 자리에 들어간 문단만 페이드인, 그 영역에서만 반짝임
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
// 빈칸 자리처럼 좁은 영역의 최소 개수
const MIN_REGION_SPARKLES = 8;
// 좁은 영역의 반짝이가 가장자리에서 잘리지 않도록 둘레에 두는 여백
const REGION_PADDING = 16;
const FADE_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
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
  minCount: number = MIN_SPARKLES,
): SparkleSpec[] => {
  if (width <= 0 || height <= 0) return [];

  const count = Math.min(
    MAX_SPARKLES,
    Math.max(
      minCount,
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

// 반짝이를 둘 영역 (container 기준 좌표)
interface SparkleRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

const createSparkleLayer = (region: SparkleRegion, minCount: number) => {
  const layer = document.createElement('div');

  layer.className = LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  layer.style.inset = 'auto';
  layer.style.left = `${region.left}px`;
  layer.style.top = `${region.top}px`;
  layer.style.width = `${region.width}px`;
  layer.style.height = `${region.height}px`;

  for (const spec of createSparkleSpecs(
    region.width,
    region.height,
    Math.random,
    minCount,
  )) {
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

// 요소들을 감싸는 영역 (container 기준, 둘레 여백 포함)
const getRegion = (
  container: HTMLElement,
  elements: HTMLElement[],
): SparkleRegion => {
  const base = container.getBoundingClientRect();
  const rects = elements.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left)) - base.left;
  const top = Math.min(...rects.map((rect) => rect.top)) - base.top;
  const right = Math.max(...rects.map((rect) => rect.right)) - base.left;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - base.top;

  return {
    left: left - REGION_PADDING,
    top: top - REGION_PADDING,
    width: right - left + REGION_PADDING * 2,
    height: bottom - top + REGION_PADDING * 2,
  };
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
    // 화면에 보이는 높이 안에만 반짝이를 둠 (긴 글에서 보이지 않는 곳에 만들지 않음)
    const { width, height } = container.getBoundingClientRect();

    container.append(
      createSparkleLayer(
        {
          left: 0,
          top: 0,
          width,
          height: Math.min(height, window.innerHeight),
        },
        MIN_SPARKLES,
      ),
    );
  }

  timers.set(
    container,
    window.setTimeout(() => {
      clear(container);
      timers.delete(container);
    }, getDraftRevealDuration() + 100),
  );
};

/**
 * 빈칸 채우기 결과가 들어간 자리의 효과 (그 문단들만 페이드인, 그 영역에서만 반짝임)
 * - 문단은 ProseMirror 가 관리하는 요소라 클래스·속성을 바꾸지 않고 Web Animations 로만 움직임
 * - 반짝이 층은 container(편집기 바깥 틀)에 붙여 문단 영역에 겹쳐 둠
 */
export const playBlankFillReveal = (
  container: HTMLElement,
  elements: HTMLElement[],
) => {
  if (elements.length === 0 || prefersReducedMotion()) return;

  for (const element of elements) {
    element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: FADE_DURATION_MS,
      easing: FADE_EASING,
      fill: 'backwards',
    });
  }

  const layer = createSparkleLayer(
    getRegion(container, elements),
    MIN_REGION_SPARKLES,
  );

  container.append(layer);
  window.setTimeout(() => layer.remove(), getDraftRevealDuration() + 100);
};

// 문서 범위 [from, to) 의 최상위 블록 요소들 (빈칸을 바꿔 넣은 문단들)
export const getBlockElements = (
  view: {
    state: { doc: { nodeAt: (pos: number) => { nodeSize: number } | null } };
    nodeDOM: (pos: number) => Node | null;
  },
  from: number,
  to: number,
): HTMLElement[] => {
  const elements: HTMLElement[] = [];

  for (let pos = from; pos < to; ) {
    const node = view.state.doc.nodeAt(pos);
    if (!node) break;

    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) elements.push(dom);
    pos += node.nodeSize;
  }

  return elements;
};
