const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'medium',
  timeStyle: 'short',
});

export const formatDateTime = (date: Date | null | undefined) => {
  return date ? dateTimeFormatter.format(date) : '-';
};

// 커밋 메시지의 첫 줄(제목)만 추출
export const getCommitTitle = (message: string) => {
  return message.split('\n')[0];
};
