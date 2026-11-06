'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { Trans } from '@lingui/react/macro';
import { FIELD_CLASS } from '@/components/onboarding/onboarding-step';
import {
  DROPDOWN_ITEM_CLASS,
  DROPDOWN_PANEL_CLASS,
} from '@/components/shared/dropdown-styles';
import LocalizedAnchor from '@/components/shared/localized-anchor';

export interface OnboardingRepositoryOption {
  // `${installationId}:${githubRepoId}` (설치가 달라도 겹치지 않는 선택 값)
  value: string;
  installationId: number;
  githubRepoId: number;
  fullName: string;
}

interface RepositorySelectProps {
  labelId: string;
  options: OnboardingRepositoryOption[];
  value: string | null;
  onChange: (value: string) => void;
  invalid?: boolean;
  errorId?: string;
}

const PANEL_CLASS = `absolute inset-x-0 top-[calc(100%+8px)] max-h-72 overflow-y-auto ${DROPDOWN_PANEL_CLASS}`;

/**
 * 저장소 선택 드롭다운 (프로필 메뉴와 같은 스타일)
 * - 열리면 선택된 항목(없으면 첫 항목)에 포커스, 방향키로 이동, Enter/Space 로 선택
 * - 바깥 클릭, Escape, 포커스가 빠져나가면 닫힘
 */
const RepositorySelect = ({
  labelId,
  options,
  value,
  onChange,
  invalid = false,
  errorId,
}: RepositorySelectProps) => {
  const listId = useId();
  const valueId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const getOptionElements = () =>
    Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );

  useEffect(() => {
    if (!isOpen) {
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
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const select = (option: OnboardingRepositoryOption) => {
    onChange(option.value);
    close();
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
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={invalid ? errorId : undefined}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        className={`${FIELD_CLASS} flex items-center gap-3 text-left ${invalid ? 'border-danger' : ''}`}
      >
        <span
          id={valueId}
          className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-ink-faint'}`}
        >
          {selected ? selected.fullName : <Trans>저장소를 선택하세요</Trans>}
        </span>
        <Image
          src="/images/onboarding/chevron-down.svg"
          alt=""
          width={16}
          height={16}
          className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen &&
        (options.length === 0 ? (
          <div id={listId} className={PANEL_CLASS}>
            <p className="px-3 py-2.5 text-[13px] leading-[1.6] text-ink-muted">
              <Trans>
                선택할 수 있는 저장소가 없습니다.{' '}
                <LocalizedAnchor
                  href="/api/github/install"
                  className="text-ink underline"
                >
                  GitHub App 에서 저장소 권한 추가하기
                </LocalizedAnchor>
              </Trans>
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
                className={`${DROPDOWN_ITEM_CLASS} truncate aria-selected:font-medium aria-selected:text-ink`}
              >
                {option.fullName}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
};

export default RepositorySelect;
