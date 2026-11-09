'use client';

import {
  useId,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { DROPDOWN_PANEL_CLASS } from '@/components/shared/dropdown-styles';
import Spinner from '@/components/shared/spinner';
import { useStudio } from '@/components/studio/studio-context';
import {
  BRAND_BUTTON_CLASS,
  ICON_BUTTON_CLASS,
} from '@/components/studio/studio-styles';
import { useDropdown } from '@/hooks/use-dropdown';
import { useLocalizedRouter } from '@/hooks/use-localized-router';
import { submitDraftPrompt } from '@/lib/actions/studio';
import { shortSha, stripCommitType } from '@/lib/studio/draft-content';
import type { PromptOptions } from '@/lib/studio/options';

// 작성 요청 영역에 바로 보이는 선택한 커밋 수 (나머지는 +N 으로 표시)
const PC_SUMMARY_COUNT = 3;
const MOBILE_SUMMARY_COUNT = 1;

type Notice = 'saved' | 'no_prompt' | 'no_commits' | 'not_found' | 'error';

const NOTICE_MESSAGES: Record<Notice, MessageDescriptor> = {
  saved: msg`AI 초안 생성이 아직 연결되지 않아 작성 요청만 기록했습니다.`,
  no_prompt: msg`작성 요청을 입력해주세요.`,
  no_commits: msg`새 초안은 커밋 내역에서 커밋을 하나 이상 선택해야 만들 수 있습니다.`,
  not_found: msg`초안 또는 저장소를 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.`,
  error: msg`작성 요청을 보내지 못했습니다. 다시 시도해주세요.`,
};

// 커밋 선택 버튼 + 선택한 커밋 목록 팝오버 (개별 해제, 모두 해제)
const SelectedCommitsMenu = () => {
  const { t } = useLingui();
  const menuId = useId();
  const { selectedCommits, toggleCommit, clearCommits, setOpenPanel } =
    useStudio();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLButtonElement>();
  const count = selectedCommits.length;

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
        className="flex h-7 items-center gap-1.5 rounded border border-line px-2 text-[11px] leading-[normal] whitespace-nowrap text-ink"
      >
        <Image
          src="/images/studio/git-commit.svg"
          alt=""
          width={14}
          height={14}
        />
        {count > 0 ? (
          <Plural value={count} other="커밋 #개" />
        ) : (
          <Trans>커밋 선택</Trans>
        )}
        <Image
          src="/images/studio/chevron-down.svg"
          alt=""
          width={12}
          height={12}
        />
      </button>
      {isOpen && (
        <div
          id={menuId}
          className={`absolute bottom-[calc(100%+6px)] left-0 w-72 ${DROPDOWN_PANEL_CLASS}`}
        >
          <p className="text-[12px] leading-[1.2] font-bold text-ink">
            <Trans>선택한 커밋</Trans>
          </p>
          <div aria-hidden="true" className="h-px bg-line" />
          {count > 0 ? (
            <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
              {selectedCommits.map((commit, index) => {
                const sha = shortSha(commit.sha);

                return (
                  <li
                    key={commit.sha}
                    className="flex shrink-0 items-center gap-2 py-1 text-[11px] leading-[1.5]"
                  >
                    <span className="shrink-0 font-mono text-ink-faint">
                      {sha}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-muted">
                      {commit.subject}
                    </span>
                    <button
                      ref={index === 0 ? firstItemRef : undefined}
                      type="button"
                      aria-label={t`${sha} 선택 해제`}
                      onClick={() => toggleCommit(commit.sha)}
                      className={`size-6 ${ICON_BUTTON_CLASS}`}
                    >
                      <Image
                        src="/images/studio/chip-x.svg"
                        alt=""
                        width={12}
                        height={12}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-1 text-[12px] leading-[1.6] break-keep text-ink-faint">
              <Trans>커밋 내역에서 초안에 쓸 커밋을 선택해주세요.</Trans>
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenPanel('commits')}
              className="h-8 rounded px-3 text-[12px] text-ink-muted hover:bg-surface pc:hidden"
            >
              <Trans>커밋 내역 열기</Trans>
            </button>
            {count > 0 && (
              <button
                type="button"
                onClick={clearCommits}
                className="h-8 rounded px-3 text-[12px] text-danger hover:bg-surface"
              >
                <Trans>모두 해제</Trans>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// 선택한 커밋 요약 (PC 3개, 모바일 1개 + 나머지 개수)
const SelectedCommitsSummary = () => {
  const { selectedCommits } = useStudio();
  const count = selectedCommits.length;

  if (count === 0) {
    return null;
  }

  const pcRest = count - PC_SUMMARY_COUNT;
  const mobileRest = count - MOBILE_SUMMARY_COUNT;

  return (
    <ul className="flex min-w-0 items-center gap-2 overflow-hidden text-[11px] leading-[normal] whitespace-nowrap pc:flex-1 pc:flex-wrap pc:gap-x-3 pc:gap-y-1.5">
      {selectedCommits.slice(0, PC_SUMMARY_COUNT).map((commit, index) => (
        <li
          key={commit.sha}
          className={`flex min-w-0 items-center gap-1.75 ${
            index >= MOBILE_SUMMARY_COUNT ? 'max-pc:hidden' : ''
          }`}
        >
          <span className="shrink-0 font-mono text-ink-faint">
            {shortSha(commit.sha)}
          </span>
          <span className="truncate text-ink-muted">
            {stripCommitType(commit.subject)}
          </span>
        </li>
      ))}
      {mobileRest > 0 && (
        <li className="shrink-0 font-mono text-ink-faint pc:hidden">
          +{mobileRest}
        </li>
      )}
      {pcRest > 0 && (
        <li className="hidden shrink-0 font-mono text-ink-faint pc:block">
          <Trans>+{pcRest}개</Trans>
        </li>
      )}
    </ul>
  );
};

interface PromptComposerProps {
  // null 이면 새 초안 (제출하면 초안을 만들고 해당 초안 화면으로 이동)
  draftId: string | null;
  options: PromptOptions;
  // 새 초안과 함께 저장할 참고 링크 (저장된 초안은 링크를 바로 저장하므로 빈 배열)
  pendingReferenceUrls: string[];
}

/**
 * 작성 요청 입력 영역
 * - 선택한 커밋, 요청 문구, 기본 옵션을 함께 제출 (⌘/Ctrl + Enter 로도 제출)
 * - 모바일: 왼쪽에 초안 목록 / 커밋 내역 사이드바 여는 버튼
 * - [임시] AI 생성 미연동: 새 초안은 커밋으로 뼈대만 만들고, 기존 초안은 요청만 기록 (lib/actions/studio.ts)
 */
const PromptComposer = ({
  draftId,
  options,
  pendingReferenceUrls,
}: PromptComposerProps) => {
  const { t, i18n } = useLingui();
  const router = useLocalizedRouter();
  const { repository, basePath, selectedCommits, setOpenPanel } = useStudio();
  const [prompt, setPrompt] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isPending, startTransition] = useTransition();
  const promptId = useId();

  const submit = () => {
    if (isPending) {
      return;
    }

    if (!prompt.trim()) {
      setNotice('no_prompt');
      return;
    }

    if (!draftId && selectedCommits.length === 0) {
      setNotice('no_commits');
      return;
    }

    setNotice(null);
    startTransition(async () => {
      try {
        const result = await submitDraftPrompt({
          repositoryId: repository.id,
          draftId,
          prompt,
          options,
          commits: selectedCommits.map(({ sha, subject }) => ({
            sha,
            subject,
          })),
          referenceLinks: pendingReferenceUrls,
        });

        if (result.status === 'created') {
          setPrompt('');
          router.push(`${basePath}/${result.draftId}`);
          return;
        }

        if (result.status === 'saved') {
          setPrompt('');
        }

        setNotice(result.status === 'invalid' ? 'no_prompt' : result.status);
      } catch {
        setNotice('error');
      }
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      (event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex shrink-0 items-start gap-2">
      {/* 모바일: 사이드바 열기 버튼 */}
      <div className="flex w-9 shrink-0 flex-col items-center gap-2 pc:hidden">
        <button
          type="button"
          aria-label={t`초안 목록 열기`}
          onClick={() => setOpenPanel('drafts')}
          className={`size-9 ${ICON_BUTTON_CLASS}`}
        >
          <Image src="/images/studio/menu.svg" alt="" width={17} height={17} />
        </button>
        <button
          type="button"
          aria-label={t`커밋 내역 열기`}
          onClick={() => setOpenPanel('commits')}
          className={`size-9 ${ICON_BUTTON_CLASS}`}
        >
          <Image
            src="/images/studio/git-commit-menu.svg"
            alt=""
            width={17}
            height={17}
          />
        </button>
      </div>
      <form
        onSubmit={handleSubmit}
        aria-busy={isPending}
        className="flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-line bg-white p-3 pc:gap-3.5 pc:p-4.5"
      >
        <div className="flex flex-col items-start gap-3 pc:flex-row pc:items-center">
          <label
            htmlFor={promptId}
            className="hidden text-[12px] leading-[normal] font-medium whitespace-nowrap text-ink pc:block"
          >
            <Trans>작성 요청</Trans>
          </label>
          <SelectedCommitsMenu />
          <SelectedCommitsSummary />
        </div>
        <textarea
          id={promptId}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          maxLength={4000}
          aria-label={t`작성 요청`}
          placeholder={t`선택한 커밋으로 어떤 글을 쓸지 요청해주세요.`}
          className="max-h-48 min-h-[3.6em] w-full resize-none text-[12px] leading-[1.8] text-ink outline-none field-sizing-content placeholder:text-ink-subtle pc:text-[14px]"
        />
        {notice && (
          <p
            role="status"
            className={`text-[11px] leading-[1.6] break-keep pc:text-[12px] ${
              notice === 'saved' ? 'text-ink-faint' : 'text-danger'
            }`}
          >
            {i18n._(NOTICE_MESSAGES[notice])}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <p
            aria-hidden="true"
            className="hidden font-mono text-[11px] leading-[normal] text-ink-faint pc:block"
          >
            ⌘ Enter
          </p>
          <button
            type="submit"
            disabled={isPending}
            className={`h-8 min-w-18 pc:h-8.5 ${BRAND_BUTTON_CLASS}`}
          >
            {isPending ? (
              <Spinner label={<Trans>작성 요청을 보내는 중...</Trans>} />
            ) : (
              <>
                <Image
                  src="/images/studio/arrow-up.svg"
                  alt=""
                  width={16}
                  height={16}
                />
                <Trans>제출</Trans>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PromptComposer;
