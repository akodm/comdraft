'use client';

import { useId } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Trans, useLingui } from '@lingui/react/macro';
import LanguageMenu from '@/components/main/language-menu';
import LocalizedLink from '@/components/shared/localized-link';
import DraftListItem from '@/components/studio/draft-list-item';
import StudioProfileMenu from '@/components/studio/profile-menu';
import { useStudio } from '@/components/studio/studio-context';
import {
  getSidebarClass,
  ICON_BUTTON_CLASS,
  THIN_SCROLL_CLASS,
} from '@/components/studio/studio-styles';
import { useDraftDeletion } from '@/hooks/use-draft-deletion';
import type { StudioDraftSummary } from '@/lib/studio/queries';

interface DraftSidebarProps {
  drafts: StudioDraftSummary[];
  userName: string;
  // 모바일에서 열려 있는지 (PC 는 항상 보임)
  isOpen: boolean;
}

/**
 * 스튜디오 왼쪽 사이드바: 저장소 정보, 언어 선택, 새 초안, 초안 목록, 프로필
 * - 초안은 개수 제한 없이 모두 불러오고 목록 영역만 스크롤
 * - 초안마다 더보기 메뉴로 삭제 (삭제한 초안은 서버 목록을 다시 불러오지 않고 바로 숨김)
 */
const DraftSidebar = ({ drafts, userName, isOpen }: DraftSidebarProps) => {
  const { t } = useLingui();
  const listLabelId = useId();
  const { repository, basePath, setOpenPanel, draftTitles, removedDraftIds } =
    useStudio();
  const { draftId: activeDraftId } = useParams<{ draftId?: string }>();
  const visibleDrafts = drafts.filter(({ id }) => !removedDraftIds.has(id));
  const { removeDraft, error: deleteError } = useDraftDeletion(
    visibleDrafts,
    activeDraftId,
  );
  const { ownerLogin, name, htmlUrl, branch } = repository;
  const repositoryLinkLabel = t`GitHub 에서 저장소 열기`;

  return (
    <aside
      aria-label={t`초안 목록`}
      className={`w-68 pc:w-70 ${getSidebarClass(isOpen)}`}
    >
      <div className="flex flex-col gap-4 px-5 pt-6 pb-5">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1 font-mono leading-[normal]">
            <p className="truncate text-[11px] text-ink-faint">
              {ownerLogin} /
            </p>
            <div className="flex min-w-0 items-center gap-1.5">
              <h1 className="truncate text-[18px] font-semibold tracking-[-0.5px] text-ink">
                {name}
              </h1>
              {/* 모바일: 저장소 이름 옆 링크 */}
              <a
                href={htmlUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={repositoryLinkLabel}
                className={`size-7 pc:hidden ${ICON_BUTTON_CLASS}`}
              >
                <Image
                  src="/images/studio/link.svg"
                  alt=""
                  width={17}
                  height={17}
                />
              </a>
            </div>
          </div>
          {/* PC: 저장소 이름 오른쪽 링크 */}
          <a
            href={htmlUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={repositoryLinkLabel}
            className={`hidden size-7 pc:flex ${ICON_BUTTON_CLASS}`}
          >
            <Image
              src="/images/studio/repo-link.svg"
              alt=""
              width={16}
              height={16}
            />
          </a>
          <button
            type="button"
            aria-label={t`사이드바 닫기`}
            onClick={() => setOpenPanel(null)}
            className={`size-9 pc:hidden ${ICON_BUTTON_CLASS}`}
          >
            <Image
              src="/images/studio/close.svg"
              alt=""
              width={17}
              height={17}
            />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-1.75">
            <Image
              src="/images/dashboard/git-branch.svg"
              alt={t`브랜치`}
              width={14}
              height={14}
            />
            <span className="truncate font-mono text-[12px] leading-[normal] text-ink-muted">
              {branch}
            </span>
          </p>
          <LanguageMenu variant="studio" />
        </div>
        <LocalizedLink
          href={basePath}
          className="flex h-10 items-center justify-center gap-2 rounded border border-line bg-white text-[13px] leading-[normal] font-medium text-ink"
        >
          <Image src="/images/studio/plus.svg" alt="" width={16} height={16} />
          <Trans>새 초안</Trans>
        </LocalizedLink>
      </div>
      <nav
        aria-labelledby={listLabelId}
        className="flex min-h-0 flex-1 flex-col gap-3 border-t border-line pt-3 pr-4 pl-3"
      >
        <p
          id={listLabelId}
          className="flex items-center gap-1.5 px-3 text-[11px] leading-[normal] text-ink-faint"
        >
          <Trans>세션</Trans>
          <span className="font-mono">{visibleDrafts.length}</span>
        </p>
        {deleteError && (
          <p
            role="alert"
            className="px-3 text-[12px] leading-[1.6] break-keep text-danger"
          >
            {deleteError === 'locked' ? (
              <Trans>
                AI 가 작성 중인 초안은 작성이 끝난 뒤 삭제할 수 있습니다.
              </Trans>
            ) : (
              <Trans>초안을 삭제하지 못했습니다. 다시 시도해주세요.</Trans>
            )}
          </p>
        )}
        {visibleDrafts.length > 0 ? (
          <ul
            className={`-mr-3 flex min-h-0 flex-1 flex-col gap-1 pr-2 pb-3 ${THIN_SCROLL_CLASS}`}
          >
            {visibleDrafts.map((draft) => (
              <DraftListItem
                key={draft.id}
                draft={draft}
                title={draftTitles[draft.id] ?? draft.title}
                href={`${basePath}/${draft.id}`}
                isActive={draft.id === activeDraftId}
                onDelete={() => void removeDraft(draft.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="px-3 text-[12px] leading-[1.6] break-keep text-ink-faint">
            <Trans>
              아직 초안이 없습니다. 커밋을 선택하고 작성 요청을 보내 첫 초안을
              만들어 보세요.
            </Trans>
          </p>
        )}
      </nav>
      <div className="border-t border-line p-3">
        <StudioProfileMenu userName={userName} />
      </div>
    </aside>
  );
};

export default DraftSidebar;
