'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import LocalizedLink from '@/components/shared/localized-link';
import Spinner from '@/components/shared/spinner';
import { useStudio } from '@/components/studio/studio-context';
import {
  getSidebarClass,
  ICON_BUTTON_CLASS,
  THIN_SCROLL_CLASS,
} from '@/components/studio/studio-styles';
import type { StudioCommit } from '@/lib/actions/studio';
import { shortSha } from '@/lib/studio/draft-content';

// 목록 끝이 스크롤 영역 아래 이만큼 가까워지면 다음 30개 요청
const PRELOAD_MARGIN = '200px';

interface CommitRowProps {
  commit: StudioCommit;
  isSelected: boolean;
  onToggle: (sha: string) => void;
}

// 커밋 한 줄: 체크박스(행 클릭으로 선택/해제) + GitHub 커밋 링크
const CommitRow = ({ commit, isSelected, onToggle }: CommitRowProps) => {
  const { t } = useLingui();
  const sha = shortSha(commit.sha);

  return (
    <li
      className={`flex min-h-16.5 shrink-0 items-center gap-2.5 rounded-md p-2.5 pc:min-h-0 ${
        isSelected ? 'bg-surface' : 'hover:bg-surface/60'
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        onClick={() => onToggle(commit.sha)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        {isSelected ? (
          <Image
            src="/images/studio/checkbox-on.svg"
            alt=""
            width={16}
            height={16}
            className="shrink-0"
          />
        ) : (
          <span className="size-4 shrink-0 rounded border border-line bg-white" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.75 text-[11px] pc:gap-0.5">
          <span className="font-mono leading-[normal] text-ink">{sha}</span>
          <span className="line-clamp-2 leading-[1.5] wrap-anywhere text-ink-muted pc:leading-[normal]">
            {commit.subject}
          </span>
        </span>
      </button>
      <a
        href={commit.htmlUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={t`GitHub 에서 커밋 ${sha} 열기`}
        className={`size-7 ${ICON_BUTTON_CLASS}`}
      >
        <Image
          src="/images/studio/commit-link.svg"
          alt=""
          width={28}
          height={28}
        />
      </a>
    </li>
  );
};

// 목록 아래 상태 (불러오는 중 / 오류 / 빈 목록)
const CommitListStatus = () => {
  const { commitHistory } = useStudio();
  const { commits, state, loadMore } = commitHistory;

  if (state === 'loading') {
    return (
      <div className="flex min-h-11 items-center justify-center text-ink-faint">
        <Spinner label={<Trans>커밋 내역을 불러오는 중...</Trans>} />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <p
        role="alert"
        className="px-2.5 py-3 text-[12px] leading-[1.6] break-keep text-danger"
      >
        <Trans>커밋 내역을 불러오지 못했습니다.</Trans>{' '}
        <button
          type="button"
          onClick={() => void loadMore()}
          className="underline"
        >
          <Trans>다시 시도</Trans>
        </button>
      </p>
    );
  }

  if (state === 'github_reauth') {
    return (
      <p
        role="alert"
        className="px-2.5 py-3 text-[12px] leading-[1.6] break-keep text-danger"
      >
        <Trans>GitHub 인증이 만료되었습니다.</Trans>{' '}
        <LocalizedLink
          href="/sign-in?error=github_reauth"
          className="underline"
        >
          <Trans>다시 로그인</Trans>
        </LocalizedLink>
      </p>
    );
  }

  if (state === 'unavailable') {
    return (
      <p
        role="alert"
        className="px-2.5 py-3 text-[12px] leading-[1.6] break-keep text-danger"
      >
        <Trans>
          저장소에 접근할 수 없습니다. GitHub 앱의 저장소 권한과 추적 브랜치를
          확인해주세요.
        </Trans>
      </p>
    );
  }

  if (commits.length === 0) {
    return (
      <p className="px-2.5 py-3 text-[12px] leading-[1.6] text-ink-faint">
        <Trans>추적 브랜치에 커밋이 없습니다.</Trans>
      </p>
    );
  }

  return null;
};

interface CommitSidebarProps {
  // 모바일에서 열려 있는지 (PC 는 항상 보임)
  isOpen: boolean;
}

/**
 * 커밋 내역 사이드바 (추적 브랜치, 최신순)
 * - 처음 30개를 불러오고 목록 끝까지 스크롤하면 30개씩 더 불러옴
 * - 체크박스는 누르는 즉시 선택/해제되고, 선택한 커밋은 작성 요청 영역에 표시
 * - 링크 버튼은 GitHub 의 커밋 화면을 새 탭으로 열기 (서비스 자체 상세 화면 없음)
 */
const CommitSidebar = ({ isOpen }: CommitSidebarProps) => {
  const { t } = useLingui();
  const { commitHistory, selectedShas, toggleCommit, setOpenPanel } =
    useStudio();
  const { commits, state, hasMore, loadMore } = commitHistory;
  const selectedCount = selectedShas.size;
  const listRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const loadedCount = `${commits.length}${hasMore && commits.length > 0 ? '+' : ''}`;

  useEffect(() => {
    const list = listRef.current;
    const sentinel = sentinelRef.current;

    // 첫 페이지를 불러오기 전이거나, 실패한 뒤에는 자동으로 다시 요청하지 않음
    if (
      !list ||
      !sentinel ||
      !hasMore ||
      commits.length === 0 ||
      state !== 'idle'
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { root: list, rootMargin: `0px 0px ${PRELOAD_MARGIN} 0px` },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, commits.length, state, loadMore]);

  return (
    <aside
      aria-label={t`커밋 내역`}
      className={`w-70 pc:gap-3 pc:p-3 ${getSidebarClass(isOpen)}`}
    >
      {/* 모바일 헤더: 제목 + 닫기, 선택 개수 */}
      <div className="flex h-16 shrink-0 items-center justify-between px-4 pc:hidden">
        <h2 className="text-[14px] leading-[normal] font-bold text-ink">
          <Trans>커밋 내역</Trans>
        </h2>
        <button
          type="button"
          aria-label={t`커밋 내역 닫기`}
          onClick={() => setOpenPanel(null)}
          className={`size-7 ${ICON_BUTTON_CLASS}`}
        >
          <Image
            src="/images/studio/close-18.svg"
            alt=""
            width={18}
            height={18}
          />
        </button>
      </div>
      <div className="flex shrink-0 items-center justify-between px-4 pb-3 text-[11px] leading-[normal] text-ink-faint pc:p-0">
        <p className="pc:hidden">
          <Trans>{selectedCount}개 선택</Trans>
        </p>
        <h2 className="hidden pc:block">
          <Trans>커밋 내역</Trans>
        </h2>
        <p className="font-mono">{loadedCount}</p>
      </div>
      <ul
        ref={listRef}
        className={`flex min-h-0 flex-1 flex-col gap-1 px-3 pb-3 pc:-mr-2 pc:px-0 pc:pr-2 ${THIN_SCROLL_CLASS}`}
      >
        {commits.map((commit) => (
          <CommitRow
            key={commit.sha}
            commit={commit}
            isSelected={selectedShas.has(commit.sha)}
            onToggle={toggleCommit}
          />
        ))}
        <li ref={sentinelRef} className="shrink-0">
          <CommitListStatus />
        </li>
      </ul>
    </aside>
  );
};

export default CommitSidebar;
