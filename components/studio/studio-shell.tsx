'use client';

import { useEffect, type ReactNode } from 'react';
import { useLingui } from '@lingui/react/macro';
import CommitSidebar from '@/components/studio/commit-sidebar';
import DraftSidebar from '@/components/studio/draft-sidebar';
import { StudioProvider, useStudio } from '@/components/studio/studio-context';
import type {
  StudioDraftSummary,
  StudioRepository,
} from '@/lib/studio/queries';

interface StudioShellProps {
  repository: StudioRepository;
  drafts: StudioDraftSummary[];
  userName: string;
  children: ReactNode;
}

interface StudioFrameProps {
  drafts: StudioDraftSummary[];
  userName: string;
  children: ReactNode;
}

const StudioFrame = ({ drafts, userName, children }: StudioFrameProps) => {
  const { t } = useLingui();
  const { openPanel, setOpenPanel } = useStudio();

  // 모바일 사이드바가 열려 있는 동안 Escape 로 닫고, 뒤 화면 스크롤을 막음
  useEffect(() => {
    if (!openPanel) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenPanel(null);
      }
    };
    const { style } = document.documentElement;
    const previousOverflow = style.overflow;

    style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openPanel, setOpenPanel]);

  return (
    <div className="flex min-h-dvh bg-white pc:h-dvh pc:overflow-hidden">
      {openPanel && (
        <button
          type="button"
          aria-label={t`사이드바 닫기`}
          onClick={() => setOpenPanel(null)}
          className="fixed inset-0 z-30 bg-ink/33 pc:hidden"
        />
      )}
      <DraftSidebar
        drafts={drafts}
        userName={userName}
        isOpen={openPanel === 'drafts'}
      />
      <CommitSidebar isOpen={openPanel === 'commits'} />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
};

/**
 * 초안 작성 스튜디오 화면 틀 (헤더/푸터 없음)
 * - PC: 초안 목록 사이드바 + 커밋 내역 사이드바 + 편집 영역
 * - 모바일: 편집 영역만 보이고, 두 사이드바는 각각 왼쪽에서 열리는 패널
 */
const StudioShell = ({
  repository,
  drafts,
  userName,
  children,
}: StudioShellProps) => {
  return (
    <StudioProvider repository={repository}>
      <StudioFrame drafts={drafts} userName={userName}>
        {children}
      </StudioFrame>
    </StudioProvider>
  );
};

export default StudioShell;
