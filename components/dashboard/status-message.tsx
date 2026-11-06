import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react/macro';

interface StatusMessageEntry {
  text: MessageDescriptor;
  isError: boolean;
}

// ?status= 쿼리 값별 안내 문구 (모듈 로드 시점에는 로케일을 모르므로 msg 디스크립터로 두고 렌더링 시 번역)
// 쿼리 값으로 조회하므로 프로토타입 키(constructor 등)에 걸리지 않도록 Map 사용
const STATUS_MESSAGES = new Map<string, StatusMessageEntry>([
  [
    'installed',
    {
      text: msg`GitHub App 이 설치되었습니다. 대시보드에 추가할 저장소를 선택하세요.`,
      isError: false,
    },
  ],
  [
    'requested',
    {
      text: msg`조직 소유자에게 설치 승인을 요청했습니다. 승인 후 저장소를 선택할 수 있습니다.`,
      isError: false,
    },
  ],
  [
    'invalid_state',
    {
      text: msg`설치 요청이 만료되었거나 유효하지 않습니다. 다시 시도해주세요.`,
      isError: true,
    },
  ],
  [
    'invalid_installation',
    {
      text: msg`접근 권한이 없는 GitHub App 설치입니다.`,
      isError: true,
    },
  ],
  [
    'invalid_repository',
    {
      text: msg`접근 권한이 없거나 설치에 포함되지 않은 저장소입니다.`,
      isError: true,
    },
  ],
]);

export const getStatusMessage = (status?: string) =>
  status ? STATUS_MESSAGES.get(status) : undefined;

interface StatusMessageProps {
  status?: string;
}

// Server Component (페이지에서 initLingui 로 설정한 i18n 사용)
const StatusMessage = ({ status }: StatusMessageProps) => {
  const { i18n } = useLingui();
  const message = getStatusMessage(status);

  if (!message) {
    return null;
  }

  return (
    <p
      role={message.isError ? 'alert' : 'status'}
      className={`rounded-md px-4 py-2 text-sm ${
        message.isError
          ? 'bg-red-50 text-red-700'
          : 'bg-green-50 text-green-700'
      }`}
    >
      {i18n._(message.text)}
    </p>
  );
};

export default StatusMessage;
