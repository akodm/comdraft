'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react/macro';
import { useModalDialog } from '@/components/shared/dialog-frame';
import AccountSettingsPanel from '@/components/studio/account-settings-panel';
import RepositorySettingsPanel from '@/components/studio/repository-settings-panel';
import { ICON_BUTTON_CLASS } from '@/components/studio/studio-styles';

export const SETTINGS_TABS = ['account', 'repository'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

const TAB_LABELS: Record<SettingsTab, MessageDescriptor> = {
  account: msg`계정 설정`,
  repository: msg`저장소 설정`,
};

// 탭에서 좌우 방향키로 옮기는 칸 수
const TAB_KEY_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

// 모바일은 화면 전체, PC 는 가운데 창 (높이를 넘으면 창 안에서 스크롤)
// - PC 높이는 h-fit: dialog 는 inset 0 고정 위치라 h-auto 면 화면 높이까지 늘어남 (브라우저 기본값이 fit-content)
const DIALOG_CLASS =
  'm-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-white p-0 text-ink backdrop:bg-ink/33 pc:m-auto pc:h-fit pc:max-h-[80vh] pc:w-[calc(100%-32px)] pc:max-w-140 pc:rounded-md pc:border pc:border-line';

interface SettingsDialogProps {
  initialTab: SettingsTab;
  // 보여 줄 탭 (스튜디오 밖에는 연동 저장소가 없어 계정 설정만 넘김)
  tabs?: readonly SettingsTab[];
  onClose: () => void;
}

/**
 * 계정 설정 / 저장소 설정 모달 (스튜디오 프로필 메뉴, 헤더 프로필 메뉴의 계정)
 * - 닫기 줄과 탭 줄은 내용을 스크롤해도 위에 고정
 * - 탭은 좌우 방향키로 옮김 (WAI-ARIA 탭 패턴)
 * - 저장소 설정 탭 내용은 디자인을 받은 뒤 구현
 */
const SettingsDialog = ({
  initialTab,
  tabs = SETTINGS_TABS,
  onClose,
}: SettingsDialogProps) => {
  const { t, i18n } = useLingui();
  const baseId = useId();
  const dialogRef = useModalDialog();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const tabRefs = useRef<Partial<Record<SettingsTab, HTMLButtonElement>>>({});

  const tabId = (value: SettingsTab) => `${baseId}-tab-${value}`;
  const panelId = (value: SettingsTab) => `${baseId}-panel-${value}`;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = TAB_KEY_STEPS[event.key];

    if (!step) {
      return;
    }

    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={i18n._(TAB_LABELS[tab])}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={DIALOG_CLASS}
    >
      <div className="sticky top-0 z-10 bg-white">
        <div className="flex justify-end px-3 pt-3 pc:px-4 pc:pt-4">
          <button
            type="button"
            aria-label={t`닫기`}
            onClick={onClose}
            className={`size-8 ${ICON_BUTTON_CLASS}`}
          >
            <Image
              src="/images/studio/close-18.svg"
              alt=""
              width={18}
              height={18}
            />
          </button>
        </div>
        <div
          role="tablist"
          className="flex gap-6 border-b border-line px-5 pc:px-7"
        >
          {tabs.map((value) => {
            const isActive = value === tab;

            return (
              <button
                key={value}
                ref={(element) => {
                  tabRefs.current[value] = element ?? undefined;
                }}
                id={tabId(value)}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId(value)}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setTab(value)}
                onKeyDown={handleTabKeyDown}
                className={`-mb-px border-b-2 pt-1 pb-3 text-[14px] leading-[normal] whitespace-nowrap outline-none focus-visible:underline ${
                  isActive
                    ? 'border-brand font-bold text-brand'
                    : 'border-transparent font-medium text-ink-faint hover:text-ink'
                }`}
              >
                {i18n._(TAB_LABELS[value])}
              </button>
            );
          })}
        </div>
      </div>
      <div
        id={panelId(tab)}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        className="px-5 pt-6 pb-8 pc:px-7 pc:pb-7"
      >
        {tab === 'account' ? (
          <AccountSettingsPanel />
        ) : (
          <RepositorySettingsPanel />
        )}
      </div>
    </dialog>
  );
};

export default SettingsDialog;
