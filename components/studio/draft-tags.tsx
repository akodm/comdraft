'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import { useStudio } from '@/components/studio/studio-context';
import { OUTLINE_BUTTON_CLASS } from '@/components/studio/studio-styles';
import { saveDraftTags } from '@/lib/actions/studio';
import { addTag } from '@/lib/posts/tags';

interface DraftTagsProps {
  repositoryId: string;
  draftId: string;
  initialTags: string[];
  // AI 작성 중에는 추가·삭제 잠금 (결과가 태그를 바꾸므로)
  isLocked: boolean;
}

type Notice = 'full' | 'error' | null;

/**
 * 편집기 본문 아래의 기술 태그 입력
 * - 입력 후 엔터나 추가 버튼으로 추가, 태그를 누르면 삭제
 * - 추가·삭제할 때마다 바로 저장 (본문 자동 저장과 별개), 실패하면 저장 전 태그로 되돌림
 * - AI 결과가 반영되면 상위에서 key 를 바꿔 새 태그로 다시 시작
 */
const DraftTags = ({
  repositoryId,
  draftId,
  initialTags,
  isLocked,
}: DraftTagsProps) => {
  const { t } = useLingui();
  const { setDraftStatus } = useStudio();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // 저장 중 중복 요청 막기 (입력칸은 비활성화하지 않아 연달아 입력할 때 포커스를 잃지 않음)
  const savingRef = useRef(false);
  const [tags, setTags] = useState(initialTags);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  const save = async (next: string[]) => {
    const previous = tags;

    savingRef.current = true;
    setTags(next);
    setNotice(null);

    try {
      const result = await saveDraftTags(repositoryId, draftId, next);

      if (result.status === 'saved') {
        setTags(result.tags);
        // 게시한 초안이면 본문을 고쳤을 때처럼 임시 저장 상태로 바뀜
        setDraftStatus(draftId, result.draftStatus);
        return true;
      }

      setTags(previous);
      // AI 작성이 시작되어 잠긴 경우는 오류로 표시하지 않음 (본문 자동 저장과 같음)
      setNotice(result.status === 'locked' ? null : 'error');
      return false;
    } catch {
      setTags(previous);
      setNotice('error');
      return false;
    } finally {
      savingRef.current = false;
    }
  };

  const handleAdd = async () => {
    if (isLocked || savingRef.current) {
      return;
    }

    const result = addTag(tags, input);

    if (result.status === 'full') {
      setNotice('full');
      return;
    }

    if (result.status === 'duplicate') {
      setInput('');
      return;
    }

    if (result.status === 'added' && (await save(result.tags))) {
      setInput('');
    }
  };

  const handleRemove = async (tag: string) => {
    if (isLocked || savingRef.current) {
      return;
    }

    // 누른 칩이 사라지므로 입력칸으로 포커스를 옮김
    inputRef.current?.focus();
    await save(tags.filter((value) => value !== tag));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 한글 조합 중 엔터는 조합을 끝내는 키라 추가하지 않음
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void handleAdd();
  };

  return (
    // relative: 화면에 보이지 않는 입력칸 라벨(sr-only, absolute)의 위치 기준을 이 안에 둠
    // → 기준이 body 가 되면 편집기 스크롤 영역에 잘리지 않고, 본문이 길 때 페이지 전체 높이를 늘림
    <div className="relative mt-10 border-t border-line pt-5">
      {tags.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                disabled={isLocked}
                aria-label={t`태그 ${tag} 삭제`}
                onClick={() => void handleRemove(tag)}
                className="flex h-7 items-center gap-1.5 rounded-full bg-surface px-3 text-[12px] leading-[normal] text-ink-muted hover:bg-line/60 disabled:opacity-50 disabled:hover:bg-surface"
              >
                {tag}
                <Image
                  src="/images/studio/chip-x.svg"
                  alt=""
                  width={10}
                  height={10}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          <Trans>태그 입력</Trans>
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={input}
          disabled={isLocked}
          placeholder={t`태그 입력`}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 w-full max-w-80 min-w-0 rounded border border-line bg-white px-3 text-[13px] leading-[normal] text-ink outline-none placeholder:text-ink-faint focus:border-brand disabled:bg-surface"
        />
        <button
          type="button"
          disabled={isLocked}
          onClick={() => void handleAdd()}
          className={`h-8 text-[12px] leading-[normal] font-medium ${OUTLINE_BUTTON_CLASS}`}
        >
          <Trans>추가</Trans>
        </button>
      </div>
      <p
        aria-live="polite"
        className="mt-2 min-h-4 text-[12px] leading-[normal] text-danger empty:mt-0 empty:min-h-0"
      >
        {notice === 'full' && <Trans>태그는 10개까지 넣을 수 있습니다</Trans>}
        {notice === 'error' && <Trans>태그를 저장하지 못했습니다</Trans>}
      </p>
    </div>
  );
};

export default DraftTags;
