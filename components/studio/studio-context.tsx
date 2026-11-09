'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  useCommitHistory,
  type CommitHistory,
} from '@/hooks/use-commit-history';
import {
  useRemovedDrafts,
  type RemovedDrafts,
} from '@/hooks/use-removed-drafts';
import type { StudioCommit } from '@/lib/actions/studio';
import type { StudioRepository } from '@/lib/studio/queries';

// 모바일에서 여는 사이드바 (PC 는 두 사이드바가 항상 보임)
export type StudioPanel = 'drafts' | 'commits';

interface StudioContextValue extends RemovedDrafts {
  repository: StudioRepository;
  // 스튜디오 기준 경로 (로케일 접두사 제외)
  basePath: string;
  commitHistory: CommitHistory;
  selectedShas: ReadonlySet<string>;
  // 선택한 커밋 (커밋 내역 순서, 최신순)
  selectedCommits: StudioCommit[];
  toggleCommit: (sha: string) => void;
  clearCommits: () => void;
  openPanel: StudioPanel | null;
  setOpenPanel: (panel: StudioPanel | null) => void;
  // 자동 저장으로 바뀐 초안 제목 (화면을 다시 렌더링하지 않고 목록에 반영)
  draftTitles: Readonly<Record<string, string>>;
  setDraftTitle: (draftId: string, title: string) => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

interface StudioProviderProps {
  repository: StudioRepository;
  children: ReactNode;
}

/**
 * 초안 작성 스튜디오 상태
 * - 레이아웃에 두어 초안을 옮겨 다녀도 커밋 내역과 선택한 커밋이 유지됨
 * - 모바일 사이드바는 페이지(경로)가 바뀌면 자동으로 닫힘
 */
export const StudioProvider = ({
  repository,
  children,
}: StudioProviderProps) => {
  const pathname = usePathname();
  const commitHistory = useCommitHistory(repository.id);
  const [selectedShas, setSelectedShas] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // 연 시점의 경로를 함께 기억해 경로가 바뀌면 닫힌 상태가 되도록 함
  const [opened, setOpened] = useState<{
    panel: StudioPanel;
    path: string;
  } | null>(null);
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
  const removedDrafts = useRemovedDrafts();

  const toggleCommit = useCallback((sha: string) => {
    setSelectedShas((previous) => {
      const next = new Set(previous);

      if (next.has(sha)) {
        next.delete(sha);
      } else {
        next.add(sha);
      }

      return next;
    });
  }, []);

  const clearCommits = useCallback(() => setSelectedShas(new Set()), []);

  const setOpenPanel = useCallback(
    (panel: StudioPanel | null) => {
      setOpened(panel ? { panel, path: pathname } : null);
    },
    [pathname],
  );

  const setDraftTitle = useCallback((draftId: string, title: string) => {
    setDraftTitles((previous) =>
      previous[draftId] === title
        ? previous
        : { ...previous, [draftId]: title },
    );
  }, []);

  const { commits } = commitHistory;
  const selectedCommits = useMemo(
    () => commits.filter(({ sha }) => selectedShas.has(sha)),
    [commits, selectedShas],
  );

  const value = useMemo<StudioContextValue>(
    () => ({
      repository,
      basePath: `/dashboard/repositories/${repository.id}/drafts`,
      commitHistory,
      selectedShas,
      selectedCommits,
      toggleCommit,
      clearCommits,
      openPanel: opened?.path === pathname ? opened.panel : null,
      setOpenPanel,
      draftTitles,
      setDraftTitle,
      ...removedDrafts,
    }),
    [
      repository,
      commitHistory,
      selectedShas,
      selectedCommits,
      toggleCommit,
      clearCommits,
      opened,
      pathname,
      setOpenPanel,
      draftTitles,
      setDraftTitle,
      removedDrafts,
    ],
  );

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
};

export const useStudio = () => {
  const context = useContext(StudioContext);

  if (!context) {
    throw new Error('useStudio 는 StudioProvider 안에서만 사용할 수 있습니다.');
  }

  return context;
};
