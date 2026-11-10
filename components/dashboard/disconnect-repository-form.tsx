'use client';

import { useRef, useState } from 'react';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import ConfirmDialog from '@/components/shared/confirm-dialog';
import SubmitButton from '@/components/shared/submit-button';
import { disconnectRepository } from '@/lib/actions/repositories';

interface DisconnectRepositoryFormProps {
  repositoryId: string;
  // 연결을 해제하면 함께 삭제되는 초안과 게시글 수
  draftCount: number;
  postCount: number;
}

/**
 * 저장소 연결 해제 폼
 * - 버튼을 누르면 확인 창을 띄우고, 확인한 뒤에만 폼을 제출함 (취소하면 아무것도 제출되지 않음)
 */
const DisconnectRepositoryForm = ({
  repositoryId,
  draftCount,
  postCount,
}: DisconnectRepositoryFormProps) => {
  const { t } = useLingui();
  const formRef = useRef<HTMLFormElement>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const hasContent = draftCount > 0 || postCount > 0;

  return (
    <>
      <form ref={formRef} action={disconnectRepository}>
        <input type="hidden" name="repositoryId" value={repositoryId} />
        <SubmitButton
          pendingText={<Trans>제거 중...</Trans>}
          className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
          onClick={(event) => {
            event.preventDefault();
            setIsConfirming(true);
          }}
        >
          <Trans>제거</Trans>
        </SubmitButton>
      </form>
      {isConfirming && (
        <ConfirmDialog
          title={t`저장소 연결 해제`}
          description={
            hasContent ? (
              <Trans>
                <Plural value={draftCount} other="초안 #개" />와{' '}
                <Plural value={postCount} other="게시글 #개" />가 함께
                삭제됩니다
              </Trans>
            ) : (
              <Trans>연결을 해제할까요?</Trans>
            )
          }
          confirmLabel={t`제거`}
          tone="danger"
          onConfirm={() => {
            setIsConfirming(false);
            formRef.current?.requestSubmit();
          }}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </>
  );
};

export default DisconnectRepositoryForm;
