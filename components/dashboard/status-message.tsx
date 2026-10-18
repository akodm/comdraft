const STATUS_MESSAGES: Record<string, { text: string; isError: boolean }> = {
  installed: {
    text: 'GitHub App 이 설치되었습니다. 대시보드에 추가할 저장소를 선택하세요.',
    isError: false,
  },
  requested: {
    text: '조직 소유자에게 설치 승인을 요청했습니다. 승인 후 저장소를 선택할 수 있습니다.',
    isError: false,
  },
  invalid_state: {
    text: '설치 요청이 만료되었거나 유효하지 않습니다. 다시 시도해주세요.',
    isError: true,
  },
  invalid_installation: {
    text: '접근 권한이 없는 GitHub App 설치입니다.',
    isError: true,
  },
  invalid_repository: {
    text: '접근 권한이 없거나 설치에 포함되지 않은 저장소입니다.',
    isError: true,
  },
  access_revoked: {
    text: '이 저장소에 대한 GitHub 접근 권한이 해제되어 동기화할 수 없습니다.',
    isError: true,
  },
};

interface StatusMessageProps {
  status?: string;
}

const StatusMessage = ({ status }: StatusMessageProps) => {
  const message = status ? STATUS_MESSAGES[status] : undefined;

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
      {message.text}
    </p>
  );
};

export default StatusMessage;
