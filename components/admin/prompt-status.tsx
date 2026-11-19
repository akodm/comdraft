import { Trans } from '@lingui/react/macro';

// 작업 상태 문구 (어드민 프롬프트 내역 목록·상세 공용)
const PromptStatus = ({ status }: { status: string }) => {
  if (status === 'queued') {
    return <Trans>대기</Trans>;
  }

  if (status === 'running') {
    return <Trans>진행 중</Trans>;
  }

  if (status === 'awaiting_input') {
    return <Trans>답변 대기</Trans>;
  }

  return status === 'completed' ? <Trans>완료</Trans> : <Trans>실패</Trans>;
};

export default PromptStatus;
