import 'server-only';
import type { JSONContent } from '@tiptap/core';
import { shortSha, stripCommitType } from '@/lib/studio/draft-content';

/**
 * [임시] AI 초안 생성 대체 구현
 * - 아직 LLM 을 연동하지 않았으므로, 작성 요청을 받으면 선택한 커밋으로 초안의 뼈대만 만듦
 *   (첫 커밋 제목 → 문서 제목, 요청 문구 → 도입 문단, 커밋마다 소제목 + 커밋 해시)
 * - 사용자가 입력한 값만 사용하므로 번역할 문구가 없음
 * - AI 생성을 연동하면 이 함수를 실제 생성 결과로 교체
 */

export interface StubCommit {
  sha: string;
  subject: string;
}

const paragraph = (text: string): JSONContent => {
  return text
    ? { type: 'paragraph', content: [{ type: 'text', text }] }
    : { type: 'paragraph' };
};

const heading = (level: number, text: string): JSONContent => {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
};

export const buildDraftStub = ({
  prompt,
  commits,
}: {
  prompt: string;
  // 최신순
  commits: StubCommit[];
}): JSONContent => {
  // 오래된 커밋부터 작업 순서대로 소제목 구성
  const ordered = [...commits].reverse();
  const title = stripCommitType(ordered[0]?.subject ?? '') || prompt;

  return {
    type: 'doc',
    content: [
      heading(1, title),
      ...prompt.split(/\n+/).map((line) => paragraph(line.trim())),
      ...ordered.flatMap(({ sha, subject }) => [
        heading(2, stripCommitType(subject)),
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: shortSha(sha), marks: [{ type: 'code' }] },
          ],
        },
      ]),
    ],
  };
};
