import * as Sentry from '@sentry/nextjs';

/**
 * 처리한(삼킨) 오류를 Sentry 로 보냄 (브라우저·서버 공통)
 * - 처리되지 않은 서버 오류는 instrumentation 의 onRequestError 가 이미 보내므로 여기서 다시 보내지 않음
 * - area: 오류가 난 기능 지점 (예: 'generation.start-runner'), Sentry 에서 태그로 검색
 * - context: 원인 파악용 식별자만 (id, 상태 코드, 단계 이름). 본문·코드·프롬프트·토큰은 넣지 않음
 */
export type ReportContext = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface ReportOptions {
  // 메시지에 본문 일부가 실릴 수 있는 오류(편집기·문서 변환)는 메시지를 빼고 종류와 위치만 보냄
  omitMessage?: boolean;
}

// 오류 종류(name)와 스택만 남긴 사본
const withoutMessage = (error: unknown): Error => {
  const name = error instanceof Error ? error.name : typeof error;
  const copy = new Error(`${name} (message omitted)`);

  copy.name = name;
  if (error instanceof Error && error.stack) {
    // V8 스택은 "이름: 메시지" 로 시작하므로 그 부분을 빼고 호출 위치만 남김 (Firefox·Safari 는 메시지가 없음)
    const header = `${error.name}: ${error.message}`;

    copy.stack = error.stack.startsWith(header)
      ? `${name}: (message omitted)${error.stack.slice(header.length)}`
      : error.stack;
  }

  return copy;
};

export const reportError = (
  error: unknown,
  area: string,
  context: ReportContext = {},
  { omitMessage = false }: ReportOptions = {},
): void => {
  Sentry.withScope((scope) => {
    scope.setTag('area', area);

    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined && value !== null) {
        scope.setTag(key, String(value));
      }
    }

    Sentry.captureException(omitMessage ? withoutMessage(error) : error);
  });
};

/**
 * 응답 뒤(after)나 크론처럼 요청 수명 밖에서 보낸 오류를 실제로 전송될 때까지 기다림
 * (서버리스 함수가 먼저 멈추면 보낸 오류가 사라질 수 있음)
 */
export const flushReports = async (timeoutMs = 2000): Promise<void> => {
  await Sentry.flush(timeoutMs).catch(() => false);
};
