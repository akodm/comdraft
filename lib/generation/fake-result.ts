import { shortSha, stripCommitType } from '@/lib/studio/draft-content';

/**
 * [임시] 가짜 실행기의 작성 결과 (Markdown, LLM 없이 커밋 정보로 만든 뼈대)
 * - 실제 작성 Lambda 의 결과 형식(Markdown)과 같아, 제목 단계·코드 언어·링크 변환을 함께 확인할 수 있음
 */

export interface FakeResultCommit {
  sha: string;
  subject: string;
  htmlUrl: string;
  files: string[];
}

// 코드 블록에 넣을 변경 파일 최대 개수
const MAX_LISTED_FILES = 10;

// 커밋 제목이 Markdown 문법으로 해석되지 않도록 특수 문자 이스케이프
const escapeMarkdown = (text: string) => {
  return text.replace(/([\\`*_{}[\]()#+\-.!|<>])/g, '\\$1');
};

/**
 * @param commits 최신순 (작업 순서대로 보이도록 오래된 커밋부터 소제목을 만듦)
 */
export const buildFakeResultMarkdown = ({
  prompt,
  commits,
}: {
  prompt: string;
  commits: FakeResultCommit[];
}) => {
  const ordered = [...commits].reverse();
  const title = stripCommitType(ordered[0]?.subject ?? '') || prompt;
  const intro = prompt
    .split(/\n+/)
    .map((line) => escapeMarkdown(line.trim()))
    .filter(Boolean);

  const sections = ordered.map(({ sha, subject, htmlUrl, files }) => {
    const listedFiles = files.slice(0, MAX_LISTED_FILES);

    return [
      `## ${escapeMarkdown(stripCommitType(subject))}`,
      `[\`${shortSha(sha)}\`](${htmlUrl})`,
      ...(listedFiles.length > 0
        ? [['```text', ...listedFiles, '```'].join('\n')]
        : []),
    ].join('\n\n');
  });

  return [`# ${escapeMarkdown(title)}`, ...intro, ...sections].join('\n\n');
};
