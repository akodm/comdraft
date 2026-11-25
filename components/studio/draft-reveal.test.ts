import { describe, expect, it } from 'vitest';
import { createSparkleSpecs } from '@/components/studio/draft-reveal';

describe('createSparkleSpecs', () => {
  it('영역이 없으면 만들지 않음', () => {
    expect(createSparkleSpecs(0, 500)).toEqual([]);
    expect(createSparkleSpecs(800, 0)).toEqual([]);
  });

  it('면적에 비례하되 16~44개', () => {
    expect(createSparkleSpecs(100, 100)).toHaveLength(16);
    expect(createSparkleSpecs(4000, 4000)).toHaveLength(44);
    expect(createSparkleSpecs(800, 440)).toHaveLength(32);
  });

  it('위치·크기·시점이 범위 안', () => {
    const specs = createSparkleSpecs(800, 600, () => 0.999);

    for (const spec of specs) {
      expect(spec.x).toBeLessThanOrEqual(800);
      expect(spec.y).toBeLessThanOrEqual(600);
      expect(spec.size).toBeGreaterThanOrEqual(10);
      expect(spec.size).toBeLessThanOrEqual(22);
      expect(spec.delay).toBeLessThanOrEqual(1400);
      expect(spec.duration).toBeGreaterThanOrEqual(900);
      expect(spec.duration).toBeLessThanOrEqual(1500);
    }
  });
});
