'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import ReferenceLinkDialog from '@/components/studio/reference-link-dialog';
import {
  ICON_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
  THIN_SCROLL_CLASS,
} from '@/components/studio/studio-styles';
import type { AddReferenceLinkStatus } from '@/hooks/use-reference-links';
import {
  splitReferenceUrl,
  type ReferenceLink,
} from '@/lib/studio/reference-link';

interface ReferenceLinkRowProps {
  link: ReferenceLink;
  onRemove: (linkId: string) => void;
  isLocked: boolean;
}

// 참고 링크 한 줄 (커밋 내역 행과 같은 모양): 호스트 + 경로, 새 탭으로 열기, 삭제
const ReferenceLinkRow = ({
  link,
  onRemove,
  isLocked,
}: ReferenceLinkRowProps) => {
  const { t } = useLingui();
  const { host, path } = splitReferenceUrl(link.url);

  return (
    <li className="flex shrink-0 items-center gap-2.5 rounded-md bg-surface p-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] leading-[normal]">
        <span className="truncate font-mono text-ink">{host}</span>
        {path && <span className="truncate text-ink-muted">{path}</span>}
      </span>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        aria-label={t`새 탭에서 ${host} 열기`}
        className={`size-7 ${ICON_BUTTON_CLASS} hover:bg-line/60`}
      >
        <Image
          src="/images/studio/commit-link.svg"
          alt=""
          width={28}
          height={28}
        />
      </a>
      <button
        type="button"
        aria-label={t`${host} 링크 삭제`}
        disabled={isLocked}
        onClick={() => onRemove(link.id)}
        className={`size-7 ${ICON_BUTTON_CLASS} hover:bg-line/60`}
      >
        <Image src="/images/studio/chip-x.svg" alt="" width={12} height={12} />
      </button>
    </li>
  );
};

interface ReferenceLinksProps {
  links: ReferenceLink[];
  onAdd: (url: string) => Promise<AddReferenceLinkStatus>;
  onRemove: (linkId: string) => Promise<boolean>;
  // AI 작성 중에는 추가/삭제 잠금
  isLocked: boolean;
}

/**
 * 기본 옵션 패널의 참고 링크: 추가 버튼(모달) + 추가한 링크 목록
 * - 초안마다 따로 저장되고, 작성 요청 때 함께 쓰이는 맥락이라 선택 없이 모두 사용
 */
const ReferenceLinks = ({
  links,
  onAdd,
  onRemove,
  isLocked,
}: ReferenceLinksProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasRemoveError, setHasRemoveError] = useState(false);

  const handleRemove = async (linkId: string) => {
    setHasRemoveError(false);
    setHasRemoveError(!(await onRemove(linkId)));
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        disabled={isLocked}
        onClick={() => setIsDialogOpen(true)}
        className={`h-8 text-[11px] leading-[normal] font-medium pc:h-8.5 pc:self-end pc:text-[13px] ${OUTLINE_BUTTON_CLASS}`}
      >
        <span className="relative hidden size-4 pc:block">
          <Image
            src="/images/studio/reference-link.svg"
            alt=""
            width={18}
            height={18}
            className="absolute -top-[0.8px] -left-[0.8px] size-[17.6px] max-w-none"
          />
        </span>
        <Trans>참고 링크 추가</Trans>
      </button>
      {(links.length > 0 || hasRemoveError) && (
        <div className="flex w-full flex-col gap-2 pc:basis-full">
          <p className="flex items-center gap-1.5 text-[11px] leading-[normal] font-bold text-ink-faint pc:font-normal">
            <Trans>참고 링크</Trans>
            <span className="font-mono">{links.length}</span>
          </p>
          {hasRemoveError && (
            <p
              role="alert"
              className="text-[12px] leading-[1.6] break-keep text-danger"
            >
              <Trans>링크를 삭제하지 못했습니다. 다시 시도해주세요.</Trans>
            </p>
          )}
          <ul className={`flex max-h-36 flex-col gap-1 ${THIN_SCROLL_CLASS}`}>
            {links.map((link) => (
              <ReferenceLinkRow
                key={link.id}
                link={link}
                isLocked={isLocked}
                onRemove={(linkId) => void handleRemove(linkId)}
              />
            ))}
          </ul>
        </div>
      )}
      <ReferenceLinkDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onAdd={onAdd}
      />
    </>
  );
};

export default ReferenceLinks;
