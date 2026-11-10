'use client';

import { useState } from 'react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import DialogFrame from '@/components/shared/dialog-frame';
import {
  BRAND_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
} from '@/components/studio/studio-styles';
import type { PostVisibility } from '@/lib/db/schema';

// 게시 창 안에 보이는 실패 사유 (서버 응답과 요청 실패)
export type PublishFailure =
  | 'no_title'
  | 'locked'
  | 'invalid'
  | 'not_found'
  | 'error';

const FAILURE_MESSAGES: Record<PublishFailure, MessageDescriptor> = {
  no_title: msg`본문에 제목을 넣어 주세요`,
  locked: msg`AI 작성 중에는 게시할 수 없습니다`,
  invalid: msg`게시할 수 없는 본문입니다. 내용을 확인해주세요.`,
  not_found: msg`초안을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.`,
  error: msg`게시하지 못했습니다. 다시 시도해주세요.`,
};

const VISIBILITY_OPTIONS: Array<{
  value: PostVisibility;
  label: MessageDescriptor;
  description: MessageDescriptor;
}> = [
  {
    value: 'public',
    label: msg`공개`,
    description: msg`누구나 목록과 검색에서 글을 찾을 수 있습니다`,
  },
  {
    value: 'unlisted',
    label: msg`일부 공개`,
    description: msg`주소를 아는 사람만 글을 볼 수 있습니다`,
  },
];

interface PublishDialogProps {
  // 다시 게시인지 (제목과 안내 문구가 달라짐)
  isRepublish: boolean;
  // 처음 선택돼 있을 공개 범위 (다시 게시면 현재 값)
  initialVisibility: PostVisibility;
  // 비공개 저장소의 초안이면 코드가 공개된다는 경고를 보임
  isPrivateRepository: boolean;
  // 본문에 남은 빈칸 노드 수 (채웠든 아니든 하나라도 있으면 게시할 수 없음)
  blankCount: number;
  // 본문에 제목이 없어 게시할 수 없음
  hasNoTitle: boolean;
  failure: PublishFailure | null;
  isPending: boolean;
  onSubmit: (visibility: PostVisibility) => void;
  onClose: () => void;
}

/**
 * 게시 확인 창: 공개 범위 선택, 비공개 저장소 경고, 게시할 수 없는 사유 표시
 * - 열 때마다 새로 마운트되어 공개 범위 선택이 초기화됨
 */
const PublishDialog = ({
  isRepublish,
  initialVisibility,
  isPrivateRepository,
  blankCount,
  hasNoTitle,
  failure,
  isPending,
  onSubmit,
  onClose,
}: PublishDialogProps) => {
  const { t, i18n } = useLingui();
  const [visibility, setVisibility] = useState(initialVisibility);
  const hasBlanks = blankCount > 0;
  const reason: PublishFailure | null =
    failure ?? (!hasBlanks && hasNoTitle ? 'no_title' : null);

  return (
    <DialogFrame
      title={isRepublish ? t`다시 게시` : t`게시하기`}
      onClose={onClose}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();

          if (!isPending && !hasBlanks && !hasNoTitle) {
            onSubmit(visibility);
          }
        }}
        className="flex flex-col gap-6"
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[12px] leading-[normal] font-medium text-ink">
            <Trans>공개 범위</Trans>
          </legend>
          {VISIBILITY_OPTIONS.map((option) => (
            // 라벨 문구가 번역 함수 호출 결과라 린트가 접근 가능한 이름을 찾지 못함
            // eslint-disable-next-line jsx-a11y/label-has-associated-control
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded border p-3 ${
                visibility === option.value
                  ? 'border-brand bg-surface'
                  : 'border-line'
              }`}
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={visibility === option.value}
                onChange={() => setVisibility(option.value)}
                className="mt-0.5 accent-brand"
              />
              <span className="flex flex-col gap-1">
                <span className="text-[13px] leading-[normal] font-medium text-ink">
                  {i18n._(option.label)}
                </span>
                <span className="text-[12px] leading-[1.6] break-keep text-ink-faint">
                  {i18n._(option.description)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {isPrivateRepository && (
          <p className="text-[12px] leading-[1.6] break-keep text-danger">
            <Trans>비공개 저장소의 코드가 본문에 그대로 공개됩니다</Trans>
          </p>
        )}
        {hasBlanks && (
          <p
            role="alert"
            className="text-[12px] leading-[1.6] break-keep text-danger"
          >
            <Trans>빈칸 {blankCount}개를 채운 뒤 게시할 수 있습니다</Trans>
          </p>
        )}
        {!hasBlanks && reason && (
          <p
            role="alert"
            className="text-[12px] leading-[1.6] break-keep text-danger"
          >
            {i18n._(FAILURE_MESSAGES[reason])}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`h-8.5 text-[12px] leading-[normal] font-medium ${OUTLINE_BUTTON_CLASS}`}
          >
            <Trans>취소</Trans>
          </button>
          <button
            type="submit"
            disabled={isPending || hasBlanks || hasNoTitle}
            aria-busy={isPending}
            className={`h-8.5 disabled:border-disabled disabled:bg-disabled disabled:text-ink-subtle disabled:opacity-100 ${BRAND_BUTTON_CLASS}`}
          >
            {isRepublish ? <Trans>다시 게시</Trans> : <Trans>게시하기</Trans>}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
};

export default PublishDialog;
