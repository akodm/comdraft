'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import DraftEditor from '@/components/studio/draft-editor';
import PromptComposer from '@/components/studio/prompt-composer';
import PromptOptions from '@/components/studio/prompt-options';
import ReferenceLinks from '@/components/studio/reference-links';
import { useStudio } from '@/components/studio/studio-context';
import { PC_MEDIA_QUERY } from '@/components/studio/studio-styles';
import { useReferenceLinks } from '@/hooks/use-reference-links';
import {
  DEFAULT_PROMPT_OPTIONS,
  type PromptOptions as PromptOptionsValue,
} from '@/lib/studio/options';
import type { StudioDraft } from '@/lib/studio/queries';

interface StudioWorkspaceProps {
  // null 이면 새 초안 화면
  draft: StudioDraft | null;
}

/**
 * 스튜디오 오른쪽 작업 영역: 초안 편집기 + 기본 옵션 + 작성 요청
 * - PC: 화면 높이에 맞추고 편집기 본문만 스크롤, 옵션과 작성 요청은 아래에 고정
 * - 모바일: 편집기 → 작성 요청 순서로 페이지 전체가 스크롤
 *   (내용이 짧으면 편집기가 남는 높이를 채워 화면 아래에 빈 공간이 생기지 않음)
 * - 기본 옵션은 작성 요청 바로 위에 겹쳐 띄움: 펼치고 접어도 편집기와 작성 요청이 움직이지 않고,
 *   대신 패널 높이만큼 편집기 아래에 여백을 둬 마지막 줄이 패널에 가리지 않게 함
 */
const StudioWorkspace = ({ draft }: StudioWorkspaceProps) => {
  const { repository } = useStudio();
  // 초안의 마지막 작성 요청 옵션으로 시작
  const [options, setOptions] = useState<PromptOptionsValue>(
    draft?.promptOptions ?? DEFAULT_PROMPT_OPTIONS,
  );
  const referenceLinks = useReferenceLinks(
    repository.id,
    draft?.id ?? null,
    draft?.referenceLinks ?? [],
  );
  const optionsRef = useRef<HTMLElement>(null);
  // 기본 옵션 패널 높이 (펼침/접힘, 줄바꿈이 바뀌면 다시 잼)
  const [optionsHeight, setOptionsHeight] = useState(0);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const bottomAreaRef = useRef<HTMLDivElement>(null);
  // 직전에 반영한 패널 높이 (처음 잰 값은 화면을 그린 직후라 스크롤을 맞추지 않음)
  const previousHeightRef = useRef<number | null>(null);

  useEffect(() => {
    const panel = optionsRef.current;

    if (!panel) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.borderBoxSize[0]?.blockSize ?? panel.offsetHeight;

      setOptionsHeight(Math.ceil(height));
    });

    // 첫 값은 바로 재고, 이후 변화는 ResizeObserver 로 반영
    setOptionsHeight(Math.ceil(panel.getBoundingClientRect().height));
    observer.observe(panel);

    return () => observer.disconnect();
  }, []);

  /**
   * 패널을 펼치거나 접어 편집기 아래 여백이 바뀔 때 보던 위치 유지 (화면에 그리기 전에 처리)
   * - 모바일: 페이지 전체가 스크롤되므로, 작성 요청이 화면에 보이고 있었다면 늘어난/줄어든 만큼 스크롤해
   *   작성 요청이 화면에서 움직이지 않게 함 (본문 마지막 줄은 여백 덕분에 패널 위에 남음)
   * - PC: 편집기 본문만 스크롤되므로, 맨 아래까지 내려 보고 있었다면 맨 아래에 그대로 붙여 둠
   */
  useLayoutEffect(() => {
    const previousHeight = previousHeightRef.current;

    previousHeightRef.current = optionsHeight;

    if (previousHeight === null || previousHeight === 0) {
      return;
    }

    const delta = optionsHeight - previousHeight;

    if (delta === 0) {
      return;
    }

    if (window.matchMedia(PC_MEDIA_QUERY).matches) {
      const scroller = editorScrollRef.current;

      if (!scroller) {
        return;
      }

      const previousScrollHeight = scroller.scrollHeight - delta;
      const wasAtBottom =
        scroller.scrollTop + scroller.clientHeight >= previousScrollHeight - 2;

      if (wasAtBottom) {
        scroller.scrollTop = scroller.scrollHeight;
      }

      return;
    }

    const bottomArea = bottomAreaRef.current;

    if (!bottomArea) {
      return;
    }

    const previousTop = bottomArea.getBoundingClientRect().top - delta;

    if (previousTop < window.innerHeight) {
      window.scrollBy(0, delta);
    }
  }, [optionsHeight]);

  return (
    <div className="flex flex-1 flex-col items-center px-4 pt-4 pb-4 pc:h-dvh pc:flex-none pc:px-10 pc:pt-7">
      <div className="flex w-full max-w-7xl flex-1 flex-col gap-3 pc:min-h-0">
        <DraftEditor
          repositoryId={repository.id}
          draft={draft}
          bottomInset={optionsHeight}
          scrollAreaRef={editorScrollRef}
        />
        <div ref={bottomAreaRef} className="relative shrink-0">
          {/* 편집기와 작성 요청 사이 간격(12px)을 그대로 두고 작성 요청 위에 겹쳐 띄움 */}
          <PromptOptions
            ref={optionsRef}
            value={options}
            onChange={setOptions}
            className="absolute inset-x-0 bottom-full z-10 mb-3"
          >
            <ReferenceLinks
              links={referenceLinks.links}
              onAdd={referenceLinks.add}
              onRemove={referenceLinks.remove}
            />
          </PromptOptions>
          <PromptComposer
            draftId={draft?.id ?? null}
            options={options}
            pendingReferenceUrls={
              draft ? [] : referenceLinks.links.map(({ url }) => url)
            }
          />
        </div>
      </div>
    </div>
  );
};

export default StudioWorkspace;
