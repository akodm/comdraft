import { useCallback, useState, useSyncExternalStore } from 'react';
import {
  clampSidebarWidth,
  getSidebarWidthStorageKey,
  parseStoredSidebarWidth,
  SIDEBAR_WIDTH,
  type SidebarWidthKey,
} from '@/lib/studio/sidebar-width';

// 같은 탭에서 저장값이 바뀐 것을 알리는 이벤트 (storage 이벤트는 다른 탭에만 옴)
const CHANGE_EVENT = 'comdraft:sidebar-width-change';

// 저장소 접근은 사생활 보호 모드 등에서 막힐 수 있어 실패하면 기본값으로 둠
const readStoredWidth = (key: SidebarWidthKey) => {
  try {
    return parseStoredSidebarWidth(
      window.localStorage.getItem(getSidebarWidthStorageKey(key)),
    );
  } catch {
    return SIDEBAR_WIDTH.default;
  }
};

const writeStoredWidth = (key: SidebarWidthKey, width: number) => {
  try {
    window.localStorage.setItem(getSidebarWidthStorageKey(key), String(width));
  } catch {
    // 저장하지 못해도 이번 화면에서는 조절한 너비를 그대로 씀
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const subscribe = (onChange: () => void) => {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
};

/**
 * 사이드바 너비 (브라우저 저장소에 사이드바별로 보관)
 * - 서버 렌더와 첫 화면은 기본값, 이후 저장값으로 바뀜
 * - preview: 끌고 있는 동안의 너비 (저장하지 않음), commit: 저장
 */
export const useSidebarWidth = (key: SidebarWidthKey) => {
  const stored = useSyncExternalStore(
    subscribe,
    () => readStoredWidth(key),
    () => SIDEBAR_WIDTH.default,
  );
  const [draft, setDraft] = useState<number | null>(null);

  const preview = useCallback((width: number) => {
    setDraft(clampSidebarWidth(width));
  }, []);

  const commit = useCallback(
    (width: number) => {
      setDraft(null);
      writeStoredWidth(key, clampSidebarWidth(width));
    },
    [key],
  );

  return { width: draft ?? stored, preview, commit };
};
