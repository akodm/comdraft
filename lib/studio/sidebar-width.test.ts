import { describe, expect, it } from 'vitest';
import {
  clampSidebarWidth,
  getSidebarWidthStorageKey,
  parseStoredSidebarWidth,
  SIDEBAR_WIDTH,
} from '@/lib/studio/sidebar-width';

describe('clampSidebarWidth', () => {
  it('최소·최대 사이로 맞춤', () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_WIDTH.min);
    expect(clampSidebarWidth(900)).toBe(SIDEBAR_WIDTH.max);
    expect(clampSidebarWidth(300.6)).toBe(301);
  });
});

describe('parseStoredSidebarWidth', () => {
  it('없거나 숫자가 아니면 기본값', () => {
    expect(parseStoredSidebarWidth(null)).toBe(SIDEBAR_WIDTH.default);
    expect(parseStoredSidebarWidth('')).toBe(SIDEBAR_WIDTH.default);
    expect(parseStoredSidebarWidth('wide')).toBe(SIDEBAR_WIDTH.default);
    expect(parseStoredSidebarWidth('Infinity')).toBe(SIDEBAR_WIDTH.default);
  });

  it('범위를 벗어난 저장값은 맞춤', () => {
    expect(parseStoredSidebarWidth('320')).toBe(320);
    expect(parseStoredSidebarWidth('10')).toBe(SIDEBAR_WIDTH.min);
    expect(parseStoredSidebarWidth('9999')).toBe(SIDEBAR_WIDTH.max);
  });
});

describe('getSidebarWidthStorageKey', () => {
  it('사이드바마다 다른 키', () => {
    expect(getSidebarWidthStorageKey('drafts')).not.toBe(
      getSidebarWidthStorageKey('commits'),
    );
  });
});
