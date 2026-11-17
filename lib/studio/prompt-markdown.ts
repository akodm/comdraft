import type { JSONContent } from '@tiptap/core';

/**
 * 작성 요청 문서(Tiptap JSON) → Markdown 글 (순수 함수)
 * - AI 가 읽을 글이라 일반 글은 이스케이프하지 않음
 *   (Tiptap Markdown 내보내기는 `_`, `*` 앞에 `\` 를 붙여 AI 가 `snake\_case` 처럼 옮겨 쓸 수 있음)
 * - 다루는 서식: 문단, 줄바꿈, 글머리·번호 목록, 코드 블록, 인용, 굵게, 기울임, 인라인 코드
 * - 그 밖의 노드는 안의 글자만 남김
 */

// 바깥 → 안쪽 순서 (인라인 코드는 다른 서식과 함께 쓰지 않으므로 따로 감쌈)
const EMPHASIS_MARKS = [
  { type: 'bold', delimiter: '**' },
  { type: 'italic', delimiter: '*' },
] as const;

const BULLET_MARKER = '- ';

const hasMark = (node: JSONContent, type: string) =>
  node.marks?.some((mark) => mark.type === type) ?? false;

// 글 안에서 가장 긴 연속 백틱 수
const longestBacktickRun = (value: string) =>
  Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));

const renderInlineCode = (value: string) => {
  const fence = '`'.repeat(longestBacktickRun(value) + 1);
  const padding =
    value.startsWith('`') || value.endsWith('`') || fence.length > 1 ? ' ' : '';

  return `${fence}${padding}${value}${padding}${fence}`;
};

const nodeText = (node: JSONContent): string =>
  node.type === 'text'
    ? (node.text ?? '')
    : (node.content ?? []).map(nodeText).join('');

/**
 * 문단 안의 글자와 서식
 * - 이어지는 노드가 같은 서식을 쓰면 한 번만 열고 닫음 (`**a *b***`)
 */
const renderInline = (nodes: JSONContent[]): string => {
  let output = '';
  let open: string[] = [];

  const closeTo = (depth: number) => {
    while (open.length > depth) {
      output += open.pop();
    }
  };

  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      closeTo(0);
      output += '\n';
      continue;
    }

    if (node.type !== 'text') {
      output += nodeText(node);
      continue;
    }

    const value = node.text ?? '';
    const wanted = EMPHASIS_MARKS.filter(({ type }) => hasMark(node, type)).map(
      ({ delimiter }) => delimiter,
    );
    let shared = 0;

    while (shared < open.length && open[shared] === wanted[shared]) {
      shared += 1;
    }

    closeTo(shared);

    for (const delimiter of wanted.slice(shared)) {
      output += delimiter;
      open = [...open, delimiter];
    }

    output += hasMark(node, 'code') ? renderInlineCode(value) : value;
  }

  closeTo(0);

  return output;
};

const indentLines = (value: string, prefix: string) =>
  value
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : line))
    .join('\n');

const renderListItem = (node: JSONContent, marker: string): string => {
  const [first, ...rest] = node.content ?? [];
  const head = first ? renderBlock(first) : '';
  const padding = ' '.repeat(marker.length);
  const body = rest
    .map(renderBlock)
    .filter(Boolean)
    .map((block) => indentLines(block, padding));

  return [
    `${marker}${indentLines(head, padding).slice(padding.length)}`,
    ...body,
  ].join('\n');
};

const renderList = (node: JSONContent, ordered: boolean): string => {
  const start = ordered ? Number(node.attrs?.start ?? 1) || 1 : 1;

  return (node.content ?? [])
    .map((child, index) =>
      renderListItem(child, ordered ? `${start + index}. ` : BULLET_MARKER),
    )
    .join('\n');
};

const renderCodeBlock = (node: JSONContent): string => {
  const value = nodeText(node);
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(value) + 1));
  const language =
    typeof node.attrs?.language === 'string' ? node.attrs.language : '';

  return `${fence}${language}\n${value}\n${fence}`;
};

const renderBlocks = (nodes: JSONContent[]): string =>
  nodes.map(renderBlock).filter(Boolean).join('\n\n');

function renderBlock(node: JSONContent): string {
  switch (node.type) {
    case 'paragraph':
      return renderInline(node.content ?? []).trim();
    case 'bulletList':
      return renderList(node, false);
    case 'orderedList':
      return renderList(node, true);
    case 'codeBlock':
      return renderCodeBlock(node);
    case 'blockquote':
      return renderBlocks(node.content ?? [])
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    default:
      return nodeText(node).trim();
  }
}

export const serializePromptDocument = (document: JSONContent): string =>
  renderBlocks(document.content ?? []).trim();
