'use client';

import { useEffect, useId, useState, type ReactNode, type Ref } from 'react';
import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  DROPDOWN_ITEM_BASE_CLASS,
  DROPDOWN_PANEL_CLASS,
} from '@/components/shared/dropdown-styles';
import {
  ICON_BUTTON_CLASS,
  PC_MEDIA_QUERY,
} from '@/components/studio/studio-styles';
import { useDropdown } from '@/hooks/use-dropdown';
import {
  GENERATION_MODELS,
  type GenerationModel,
} from '@/lib/generation/contract';
import { MODEL_USAGE_RATIO, ROLE_MODELS } from '@/lib/generation/models';
import {
  LENGTH_LABELS,
  LENGTHS,
  POST_TYPE_LABELS,
  POST_TYPES,
  REQUIRED_BLOCK_LABELS,
  REQUIRED_BLOCKS,
  TONE_LABELS,
  TONES,
  type PromptOptions as PromptOptionsValue,
  type RequiredBlock,
} from '@/lib/studio/options';

const TONE_LABEL = msg`말투`;
const POST_TYPE_LABEL = msg`유형`;
const LENGTH_LABEL = msg`길이`;
const MODEL_LABEL = msg`모델`;

// 모델 이름은 고유명사라 번역하지 않음
const MODEL_NAMES: Record<GenerationModel, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
};
const MODEL_LABELS = Object.fromEntries(
  GENERATION_MODELS.map((model) => [model, { message: MODEL_NAMES[model] }]),
) as Record<GenerationModel, MessageDescriptor>;

// 쓸 수 없는 모델의 잠금 표시: 그 모델을 처음 쓸 수 있는 등급
const UNLOCK_ROLE_LABELS: Record<string, MessageDescriptor> = {
  pro: msg`Pro 이상`,
  max: msg`Max`,
};

const getUnlockRoleLabel = (model: GenerationModel) => {
  const role = Object.keys(ROLE_MODELS).find((key) =>
    ROLE_MODELS[key].includes(model),
  );

  return role ? UNLOCK_ROLE_LABELS[role] : undefined;
};

interface RadioGroupProps<T extends string> {
  label: MessageDescriptor;
  name: string;
  values: readonly T[];
  labels: Record<T, MessageDescriptor>;
  value: T;
  onChange: (value: T) => void;
  // 선택 불가 항목 (비활성 + 잠금 표시). 없으면 모두 선택 가능
  isOptionDisabled?: (option: T) => boolean;
  // 항목 문구를 바꿔 그림 (잠금 표시 등을 라벨에 포함해 스크린 리더가 함께 읽음)
  renderLabel?: (option: T, label: string, isDisabled: boolean) => ReactNode;
  // 그룹 아래 안내 한 줄
  hint?: string;
  className?: string;
}

// 말투 / 유형 / 길이 / 모델 단일 선택
const RadioGroup = <T extends string>({
  label,
  name,
  values,
  labels,
  value,
  onChange,
  isOptionDisabled,
  renderLabel,
  hint,
  className = 'pc:w-70',
}: RadioGroupProps<T>) => {
  const { i18n } = useLingui();

  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="mb-2 text-[11px] leading-[normal] font-bold text-ink-faint pc:font-normal">
        {i18n._(label)}
      </legend>
      <div className="flex flex-wrap gap-2 pc:gap-4">
        {values.map((option) => {
          const isChecked = option === value;
          const isDisabled = isOptionDisabled?.(option) ?? false;
          const label = i18n._(labels[option]);

          return (
            <label
              key={option}
              className={`flex h-7 items-center gap-1.5 pc:h-auto pc:gap-2 ${
                isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => onChange(option)}
                className="peer sr-only"
              />
              {isChecked ? (
                <>
                  <Image
                    src="/images/studio/radio-on-mobile.svg"
                    alt=""
                    width={14}
                    height={14}
                    className="pc:hidden"
                  />
                  <Image
                    src="/images/studio/radio-on.svg"
                    alt=""
                    width={16}
                    height={16}
                    className="hidden pc:block"
                  />
                </>
              ) : (
                <span className="size-3.5 rounded-full border border-ink-subtle bg-white pc:size-4 pc:border-line" />
              )}
              <span
                className={`text-[11px] leading-[normal] whitespace-nowrap peer-focus-visible:underline pc:text-[13px] ${
                  isChecked
                    ? 'font-medium text-ink pc:font-normal'
                    : 'text-ink pc:text-ink-muted'
                }`}
              >
                {renderLabel ? renderLabel(option, label, isDisabled) : label}
              </span>
            </label>
          );
        })}
      </div>
      {hint && (
        <p className="mt-2 text-[11px] leading-[normal] text-ink-faint">
          {hint}
        </p>
      )}
    </fieldset>
  );
};

interface RequiredBlocksSelectProps {
  value: RequiredBlock[];
  onChange: (value: RequiredBlock[]) => void;
}

// 필수 항목 다중 선택: 선택한 항목은 칩(누르면 제거), 더 보기 드롭다운에서 추가/제거
const RequiredBlocksSelect = ({
  value,
  onChange,
}: RequiredBlocksSelectProps) => {
  const { t } = useLingui();
  const menuId = useId();
  const labelId = useId();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLButtonElement>();

  const toggleBlock = (block: RequiredBlock) => {
    onChange(
      value.includes(block)
        ? value.filter((item) => item !== block)
        : REQUIRED_BLOCKS.filter(
            (item) => item === block || value.includes(item),
          ),
    );
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex w-full flex-col gap-2 pc:w-120"
    >
      <p
        id={labelId}
        className="text-[11px] leading-[normal] font-bold text-ink-faint pc:font-normal"
      >
        <Trans>필수 항목</Trans>
      </p>
      <div
        ref={containerRef}
        onBlur={handleBlur}
        className="relative flex items-start gap-2 rounded border border-line bg-white px-2 py-1.5 pc:items-center pc:px-3 pc:py-2.5"
      >
        <ul className="flex min-w-0 flex-wrap gap-2">
          {value.map((block) => {
            const label = REQUIRED_BLOCK_LABELS[block];

            return (
              <li key={block}>
                <button
                  type="button"
                  aria-label={t`${label} 제거`}
                  onClick={() => toggleBlock(block)}
                  className="flex h-7 items-center gap-1.5 rounded bg-surface px-2.5 text-[11px] leading-[normal] font-medium whitespace-nowrap text-ink pc:h-auto pc:border pc:border-line pc:px-2 pc:py-1 pc:font-mono pc:font-normal"
                >
                  {label}
                  <Image
                    src="/images/studio/chip-x.svg"
                    alt=""
                    width={12}
                    height={12}
                    className="hidden pc:block"
                  />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          ref={triggerRef}
          type="button"
          aria-label={t`필수 항목 더 보기`}
          aria-expanded={isOpen}
          aria-controls={menuId}
          onClick={toggle}
          className="flex h-7 shrink-0 items-center gap-1 text-[13px] leading-[normal] whitespace-nowrap text-ink-faint pc:h-auto"
        >
          <span className="hidden pc:inline">
            <Trans>더 보기</Trans>
          </span>
          <Image
            src="/images/studio/more-chevron.svg"
            alt=""
            width={12}
            height={12}
          />
        </button>
        {isOpen && (
          <div
            id={menuId}
            className={`absolute right-0 bottom-[calc(100%+4px)] w-44 ${DROPDOWN_PANEL_CLASS}`}
          >
            <ul className="flex flex-col gap-1">
              {REQUIRED_BLOCKS.map((block, index) => {
                const isChecked = value.includes(block);

                return (
                  <li key={block}>
                    <button
                      ref={index === 0 ? firstItemRef : undefined}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={isChecked}
                      onClick={() => toggleBlock(block)}
                      className={`${DROPDOWN_ITEM_BASE_CLASS} flex items-center gap-2.5 font-mono ${
                        isChecked ? 'text-ink' : 'text-ink-muted'
                      }`}
                    >
                      {isChecked ? (
                        <Image
                          src="/images/studio/checkbox-on.svg"
                          alt=""
                          width={16}
                          height={16}
                        />
                      ) : (
                        <span className="size-4 rounded border border-line bg-white" />
                      )}
                      {REQUIRED_BLOCK_LABELS[block]}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

interface PromptOptionsProps {
  value: PromptOptionsValue;
  onChange: (value: PromptOptionsValue) => void;
  // 현재 등급에서 쓸 수 있는 모델 (나머지는 잠금 표시)
  allowedModels: GenerationModel[];
  // 작업 영역이 패널 높이를 재서 편집기 아래 여백을 맞추는 데 사용
  ref?: Ref<HTMLElement>;
  className?: string;
  // 옵션 뒤에 이어지는 항목 (참고 링크 추가 버튼과 목록)
  children?: ReactNode;
}

// 펼침 상태별 클래스. null 은 마운트 전(서버 렌더링 포함): CSS 로 PC 는 펼침, 모바일은 접힘으로 보여
// 마운트 후 화면 크기로 상태를 정해도 화면이 바뀌지 않음
const byExpanded = (
  isExpanded: boolean | null,
  classes: { expanded: string; collapsed: string; initial: string },
) => {
  if (isExpanded === null) {
    return classes.initial;
  }

  return isExpanded ? classes.expanded : classes.collapsed;
};

/**
 * 작성 요청 기본 옵션 (말투, 유형, 길이, 필수 항목, 참고 링크)
 * - 선택한 값은 작성 요청과 함께 서버로 보내고 요청 기록에 저장
 * - 참고 링크(추가 버튼, 목록)는 children 으로 받아 옵션 뒤에 배치
 * - 우측 상단 화살표로 펼치고 접음 (기본: PC 펼침, 모바일 접힘). 접으면 제목 옆에 현재 선택 요약
 * - 작업 영역에서 작성 요청 입력창 위에 겹쳐 띄우므로 펼치고 접어도 편집기 크기는 바뀌지 않음
 */
const PromptOptions = ({
  value,
  onChange,
  allowedModels,
  ref,
  className = '',
  children,
}: PromptOptionsProps) => {
  const { t, i18n } = useLingui();
  const groupName = useId();
  const contentId = useId();
  const renderModelLabel = (
    model: GenerationModel,
    name: string,
    isLocked: boolean,
  ) => {
    const ratio = MODEL_USAGE_RATIO[model];
    const unlockLabel = getUnlockRoleLabel(model);
    const detail = model === 'haiku' ? t`기본` : t`사용량 약 ${ratio}배`;

    return (
      <>
        {name} · {detail}
        {isLocked && unlockLabel && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle">
            <Image
              src="/images/studio/lock.svg"
              alt=""
              width={12}
              height={12}
            />
            {i18n._(unlockLabel)}
          </span>
        )}
      </>
    );
  };
  // 펼침 상태 (기본: PC 펼침, 모바일 접힘). 마운트 전에는 null
  const [isExpanded, setIsExpanded] = useState<boolean | null>(null);

  useEffect(() => {
    setIsExpanded(window.matchMedia(PC_MEDIA_QUERY).matches);
  }, []);

  // 접혀 있을 때 제목 옆에 보이는 현재 선택 요약
  const summary = [
    TONE_LABELS[value.tone],
    POST_TYPE_LABELS[value.postType],
    LENGTH_LABELS[value.length],
  ]
    .map((label) => i18n._(label))
    .concat(MODEL_NAMES[value.model])
    .join(' · ');

  return (
    <section
      ref={ref}
      aria-label={t`기본 옵션`}
      className={`flex flex-col gap-2 rounded-md border border-line bg-white p-3 pc:px-4.5 pc:py-3 ${className}`}
    >
      <div className="flex items-center gap-3">
        <h2 className="shrink-0 text-[12px] leading-[normal] font-medium text-ink pc:text-[13px]">
          <Trans>기본 옵션</Trans>
        </h2>
        <p
          aria-hidden={isExpanded ?? undefined}
          className={`min-w-0 flex-1 truncate text-[11px] leading-[normal] text-ink-faint ${byExpanded(
            isExpanded,
            { expanded: 'invisible', collapsed: '', initial: 'pc:invisible' },
          )}`}
        >
          {summary}
        </p>
        {/* 옵션 영역 펼치기/접기 (접어도 선택한 값은 그대로 작성 요청에 사용) */}
        <button
          type="button"
          aria-expanded={isExpanded ?? undefined}
          aria-controls={contentId}
          aria-label={isExpanded ? t`기본 옵션 접기` : t`기본 옵션 펼치기`}
          onClick={() =>
            setIsExpanded(
              (previous) =>
                !(previous ?? window.matchMedia(PC_MEDIA_QUERY).matches),
            )
          }
          className={`-m-1.5 size-7 ${ICON_BUTTON_CLASS}`}
        >
          <Image
            src="/images/studio/chevron-down.svg"
            alt=""
            width={12}
            height={12}
            className={`transition-transform duration-200 ${byExpanded(
              isExpanded,
              {
                expanded: 'rotate-180',
                collapsed: '',
                initial: 'pc:rotate-180',
              },
            )}`}
          />
        </button>
      </div>
      <div
        id={contentId}
        className={`flex-col items-start gap-3 pc:flex-row pc:flex-wrap pc:gap-x-6 pc:gap-y-3 ${byExpanded(
          isExpanded,
          { expanded: 'flex', collapsed: 'hidden', initial: 'hidden pc:flex' },
        )}`}
      >
        <RadioGroup
          label={TONE_LABEL}
          name={`${groupName}-tone`}
          values={TONES}
          labels={TONE_LABELS}
          value={value.tone}
          onChange={(tone) => onChange({ ...value, tone })}
        />
        <RadioGroup
          label={POST_TYPE_LABEL}
          name={`${groupName}-type`}
          values={POST_TYPES}
          labels={POST_TYPE_LABELS}
          value={value.postType}
          onChange={(postType) => onChange({ ...value, postType })}
        />
        <RadioGroup
          label={LENGTH_LABEL}
          name={`${groupName}-length`}
          values={LENGTHS}
          labels={LENGTH_LABELS}
          value={value.length}
          onChange={(length) => onChange({ ...value, length })}
        />
        <RadioGroup
          label={MODEL_LABEL}
          name={`${groupName}-model`}
          values={GENERATION_MODELS}
          labels={MODEL_LABELS}
          value={value.model}
          onChange={(model) => onChange({ ...value, model })}
          isOptionDisabled={(model) => !allowedModels.includes(model)}
          renderLabel={(model, name, isLocked) =>
            renderModelLabel(model, name, isLocked)
          }
          hint={t`높은 모델일수록 이번 주 사용량이 빨리 줄어듭니다.`}
          className="pc:w-full"
        />
        <RequiredBlocksSelect
          value={value.requiredBlocks}
          onChange={(requiredBlocks) => onChange({ ...value, requiredBlocks })}
        />
        {children}
      </div>
    </section>
  );
};

export default PromptOptions;
