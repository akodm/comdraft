/**
 * AI 초안이 본문에 반영될 때의 등장 효과 (css/globals.css 의 [data-draft-reveal])
 * - 본문 블록이 위에서부터 차례로 나타나고, 도면을 인쇄하듯 옅은 브랜드색 줄이 위→아래로 한 번 지나감
 * - 같은 요소에서 다시 재생할 수 있도록 속성을 지웠다가 다시 달고, 끝나면 지움
 */

// 블록마다 늦추는 시간과 늦추는 블록 수 상한 (긴 글도 1초 안에 모두 시작)
const BLOCK_STAGGER_MS = 60;
const MAX_STAGGERED_BLOCKS = 16;
const BLOCK_DURATION_MS = 560;
const SCAN_DURATION_MS = 1400;

const ATTRIBUTE = 'data-draft-reveal';
const timers = new WeakMap<HTMLElement, number>();

export const getDraftRevealDuration = (blockCount: number) =>
  Math.max(
    SCAN_DURATION_MS,
    Math.min(blockCount, MAX_STAGGERED_BLOCKS) * BLOCK_STAGGER_MS +
      BLOCK_DURATION_MS,
  );

export const playDraftReveal = (container: HTMLElement, blockCount: number) => {
  const previous = timers.get(container);
  if (previous !== undefined) window.clearTimeout(previous);

  container.removeAttribute(ATTRIBUTE);
  // 속성을 다시 달기 전에 스타일을 한 번 계산해 애니메이션을 처음부터 다시 시작
  void container.offsetWidth;
  container.setAttribute(ATTRIBUTE, '');

  timers.set(
    container,
    window.setTimeout(
      () => {
        container.removeAttribute(ATTRIBUTE);
        timers.delete(container);
      },
      getDraftRevealDuration(blockCount) + 100,
    ),
  );
};
