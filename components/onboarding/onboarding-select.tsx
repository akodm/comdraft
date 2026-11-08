'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { FIELD_CLASS } from '@/components/onboarding/onboarding-step';
import {
  DROPDOWN_ITEM_CLASS,
  DROPDOWN_PANEL_CLASS,
} from '@/components/shared/dropdown-styles';

export interface OnboardingSelectOption {
  value: string;
  label: string;
}

interface OnboardingSelectProps {
  labelId: string;
  options: OnboardingSelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  // 선택된 값이 없을 때 표시
  placeholder: ReactNode;
  // 선택할 항목이 없을 때 목록 대신 표시
  emptyContent: ReactNode;
  // 목록을 불러오는 중이거나 선행 선택이 필요할 때
  disabled?: boolean;
  busy?: boolean;
  invalid?: boolean;
  errorId?: string;
}

const PANEL_CLASS = `absolute inset-x-0 top-[calc(100%+8px)] max-h-72 overflow-y-auto ${DROPDOWN_PANEL_CLASS}`;

/**
 * 온보딩 입력란 스타일의 선택 드롭다운 (저장소, 브랜치)
 * - 열리면 선택된 항목(없으면 첫 항목)에 포커스, 방향키/Home/End 로 이동, Enter/Space 로 선택
 * - 바깥 클릭, Escape, 포커스가 빠져나가면 닫힘
 * - 목록 항목은 자르지 않고 줄바꿈 (말줄임은 선택 값 표시 영역에만)
 */
const OnboardingSelect = ({
  labelId,
  options,
  value,
  onChange,
  placeholder,
  emptyContent,
  disabled = false,
  busy = false,
  invalid = false,
  errorId,
}: OnboardingSelectProps) => {
  const listId = useId();
  const valueId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  // 비활성화되면 열린 상태도 무시 (목록을 다시 불러오는 동안 등)
  const isExpanded = isOpen && !disabled;

  const getOptionElements = () =>
    Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const optionElements = getOptionElements();

    (
      optionElements.find(
        (element) => element.getAttribute('aria-selected') === 'true',
      ) ?? optionElements[0]
    )?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  const select = (option: OnboardingSelectOption) => {
    onChange(option.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    const optionElements = getOptionElements();
    const index = optionElements.indexOf(document.activeElement as HTMLElement);
    const focusAt = (nextIndex: number) =>
      optionElements[
        Math.min(Math.max(nextIndex, 0), optionElements.length - 1)
      ]?.focus();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(optionElements.length - 1);
        break;
    }
  };

  // 드롭다운 안에서 포커스가 빠져나가면 닫음 (Tab 으로 다음 요소로 이동한 경우)
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (
      event.relatedTarget &&
      !event.currentTarget.contains(event.relatedTarget as Node)
    ) {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-busy={busy}
        aria-haspopup="listbox"
        aria-expanded={isExpanded}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={invalid ? errorId : undefined}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        className={`${FIELD_CLASS} flex items-center gap-3 text-left disabled:cursor-not-allowed disabled:bg-surface ${invalid ? 'border-danger' : ''}`}
      >
        <span
          id={valueId}
          className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-ink-faint'}`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <Image
          src="/images/onboarding/chevron-down.svg"
          alt=""
          width={16}
          height={16}
          className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>
      {isExpanded &&
        (options.length === 0 ? (
          <div id={listId} className={PANEL_CLASS}>
            <p className="px-3 py-2.5 text-[13px] leading-[1.6] text-ink-muted">
              {emptyContent}
            </p>
          </div>
        ) : (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            onKeyDown={handleListKeyDown}
            className={PANEL_CLASS}
          >
            {options.map((option) => (
              <li
                key={option.value}
                role="option"
                tabIndex={-1}
                aria-selected={option.value === value}
                onClick={() => select(option)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    select(option);
                  }
                }}
                className={`${DROPDOWN_ITEM_CLASS} wrap-anywhere aria-selected:font-medium aria-selected:text-ink`}
              >
                {option.label}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
};

export default OnboardingSelect;
