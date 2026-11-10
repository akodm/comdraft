import type { JSONContent } from '@tiptap/core';

/**
 * 초안 본문(Tiptap JSON)과 커밋 표시용 공통 함수 (서버/클라이언트 공용)
 */

// 목록에 표시하는 초안 제목 최대 길이
const MAX_TITLE_LENGTH = 200;

// 저장 가능한 본문 최대 크기 (JSON 문자열 기준)
export const MAX_DRAFT_CONTENT_LENGTH = 500_000;

// 화면에 표시하는 짧은 커밋 해시 (GitHub 과 같은 7자리)
export const shortSha = (sha: string) => sha.slice(0, 7);

// 커밋 메시지의 첫 줄 (제목)
export const getCommitSubject = (message: string) => {
  return message.split('\n', 1)[0]?.trim() ?? '';
};

/**
 * Conventional Commits 접두사를 뺀 커밋 제목 (작성 요청 영역의 선택한 커밋 요약용)
 * @example stripCommitType('feat(image): 지연 로딩 적용') // '지연 로딩 적용'
 */
export const stripCommitType = (subject: string) => {
  return subject.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '') || subject;
};

const getNodeText = (node: JSONContent): string => {
  if (node.type === 'text') {
    return node.text ?? '';
  }

  return (node.content ?? []).map(getNodeText).join('');
};

// Tiptap 문서인지 최소한으로 확인 (최상위가 doc 이고 content 가 배열)
export const isDraftDocument = (value: unknown): value is JSONContent => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const { type, content } = value as JSONContent;

  return type === 'doc' && (content === undefined || Array.isArray(content));
};

// 클라이언트가 보낸 본문 JSON 문자열을 Tiptap 문서로 (형식이 맞지 않으면 null)
export const parseDraftDocument = (contentJson: unknown) => {
  if (
    typeof contentJson !== 'string' ||
    contentJson.length > MAX_DRAFT_CONTENT_LENGTH
  ) {
    return null;
  }

  try {
    const content: unknown = JSON.parse(contentJson);

    return isDraftDocument(content) ? content : null;
  } catch {
    return null;
  }
};

/**
 * 목록 표시용 초안 제목
 * - 첫 번째 제목(heading), 없으면 내용이 있는 첫 블록의 텍스트
 * - 본문이 비어 있으면 빈 문자열 (화면에서 "제목 없는 초안" 으로 표시)
 */
export const extractDraftTitle = (doc: JSONContent) => {
  const blocks = (doc.content ?? []).map((node) => ({
    isHeading: node.type === 'heading',
    text: getNodeText(node).replace(/\s+/g, ' ').trim(),
  }));
  const block =
    blocks.find(({ isHeading, text }) => isHeading && text) ??
    blocks.find(({ text }) => text);

  return (block?.text ?? '').slice(0, MAX_TITLE_LENGTH);
};
