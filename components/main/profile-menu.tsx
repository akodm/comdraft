'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  DROPDOWN_ITEM_BASE_CLASS,
  DROPDOWN_ITEM_CLASS,
  DROPDOWN_PANEL_CLASS,
} from '@/components/shared/dropdown-styles';
import LocalizedLink from '@/components/shared/localized-link';
import ConfirmDialog from '@/components/shared/confirm-dialog';
import SignOutButton from '@/components/shared/sign-out-button';
import SettingsDialog from '@/components/studio/settings-dialog';
import { useDropdown } from '@/hooks/use-dropdown';
import { useLocalizedRouter } from '@/hooks/use-localized-router';
import { DELETE_CONFIRM_DELAY_MS } from '@/lib/account/delete-account-rules';
import { deleteAccount } from '@/lib/actions/account';

interface ProfileMenuProps {
  isSignedIn: boolean;
}

const PROFILE_BUTTON_CLASS =
  'flex size-10 items-center justify-center rounded-full border border-line bg-white';

// 드롭다운 항목 (첫 항목은 열릴 때 포커스되며 강조 표시)
const MENU_ITEM_CLASS = `${DROPDOWN_ITEM_CLASS} whitespace-nowrap`;
const DANGER_MENU_ITEM_CLASS = `${DROPDOWN_ITEM_BASE_CLASS} whitespace-nowrap text-danger`;

const ProfileIcon = () => {
  return (
    <>
      <Image
        src="/images/main/user-round-mobile.svg"
        alt=""
        width={17}
        height={17}
        className="pc:hidden"
      />
      <Image
        src="/images/main/user-round.svg"
        alt=""
        width={18}
        height={18}
        className="hidden pc:block"
      />
    </>
  );
};

/**
 * 헤더 프로필 버튼
 * - 로그아웃 상태: 로그인/회원가입 페이지로 이동
 * - 로그인 상태: 프로필 드롭다운 (바깥 클릭, Escape, 페이지 이동 시 닫힘)
 * - 계정: 스튜디오와 같은 설정 모달을 계정 설정 탭만으로 띄움 (스튜디오 밖이라 저장소 설정은 없음)
 * - 회원탈퇴: 확인 창을 띄우고 2초 뒤에 탈퇴 버튼을 누를 수 있게 함, 탈퇴하면 메인으로 이동
 */
const ProfileMenu = ({ isSignedIn }: ProfileMenuProps) => {
  const { t } = useLingui();
  const menuId = useId();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLAnchorElement>();
  const router = useLocalizedRouter();
  const [openDialog, setOpenDialog] = useState<'account' | 'delete' | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasDeleteError, setHasDeleteError] = useState(false);

  const open = (dialog: 'account' | 'delete') => {
    // 메뉴 버튼으로 포커스를 먼저 옮겨 두면 모달을 닫을 때 그 버튼으로 돌아옴
    triggerRef.current?.focus();
    toggle();
    setHasDeleteError(false);
    setOpenDialog(dialog);
  };

  const closeDialog = () => {
    if (!isDeleting) {
      setOpenDialog(null);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setHasDeleteError(false);

    try {
      const result = await deleteAccount();

      if (result.status === 'deleted') {
        // 로그인 정보가 사라졌으므로 메인으로 보내고 서버 화면을 다시 받음
        router.replace('/');
        router.refresh();
        return;
      }

      setHasDeleteError(true);
    } catch {
      setHasDeleteError(true);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isSignedIn) {
    return (
      <LocalizedLink
        href="/sign-in"
        aria-label={t`로그인`}
        className={PROFILE_BUTTON_CLASS}
      >
        <ProfileIcon />
      </LocalizedLink>
    );
  }

  return (
    <>
      <div ref={containerRef} className="relative" onBlur={handleBlur}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={t`프로필 메뉴`}
          aria-expanded={isOpen}
          aria-controls={menuId}
          onClick={toggle}
          className={PROFILE_BUTTON_CLASS}
        >
          <ProfileIcon />
        </button>
        {isOpen && (
          <div
            id={menuId}
            className={`absolute top-[calc(100%+8px)] right-0 w-60 ${DROPDOWN_PANEL_CLASS}`}
          >
            <p className="text-[12px] leading-[1.2] font-bold whitespace-nowrap text-ink">
              <Trans>프로필 메뉴</Trans>
            </p>
            <div aria-hidden="true" className="h-px bg-line" />
            <ul className="flex flex-col gap-1">
              <li>
                <LocalizedLink
                  ref={firstItemRef}
                  href="/dashboard"
                  className={MENU_ITEM_CLASS}
                >
                  <Trans>대시보드</Trans>
                </LocalizedLink>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => open('account')}
                  className={MENU_ITEM_CLASS}
                >
                  <Trans>계정</Trans>
                </button>
              </li>
              <li>
                <SignOutButton className={MENU_ITEM_CLASS} />
              </li>
            </ul>
            <div aria-hidden="true" className="h-px bg-line" />
            <button
              type="button"
              onClick={() => open('delete')}
              className={DANGER_MENU_ITEM_CLASS}
            >
              <Trans>회원탈퇴</Trans>
            </button>
          </div>
        )}
      </div>
      {openDialog === 'account' && (
        <SettingsDialog
          initialTab="account"
          tabs={['account']}
          onClose={closeDialog}
        />
      )}
      {openDialog === 'delete' && (
        <ConfirmDialog
          title={t`회원탈퇴`}
          description={
            <Trans>
              탈퇴하면 계정과 작성한 초안, 게시한 글, 업로드한 이미지가 모두
              삭제되며 되돌릴 수 없습니다. GitHub 에서 이 서비스의 로그인 권한도
              철회됩니다. 저장소에 설치한 GitHub App 은 GitHub 설정에서 따로
              제거할 수 있습니다.
            </Trans>
          }
          confirmLabel={t`탈퇴하기`}
          cancelLabel={<Trans>취소</Trans>}
          tone="danger"
          isPending={isDeleting}
          confirmDelayMs={DELETE_CONFIRM_DELAY_MS}
          error={
            hasDeleteError ? (
              <Trans>탈퇴하지 못했습니다. 다시 시도해주세요.</Trans>
            ) : undefined
          }
          onConfirm={() => void handleDelete()}
          onClose={closeDialog}
        />
      )}
    </>
  );
};

export default ProfileMenu;
