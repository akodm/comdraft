import { describe, expect, it } from 'vitest';
import { buildFakeResultMarkdown } from '@/lib/generation/fake-result';

describe('buildFakeResultMarkdown 의 직접 입력 코드', () => {
  it('직접 입력한 코드 이름은 보여 주고 코드 원문은 넣지 않는다', () => {
    const markdown = buildFakeResultMarkdown({
      prompt: '구조를 정리해 줘',
      commits: [],
      codeInputNames: ['src/useAuth.ts', '코드 2'],
    });

    expect(markdown).toContain('## 직접 입력한 코드');
    expect(markdown).toContain('src/useAuth.ts\n코드 2');
    expect(markdown).not.toContain('const secret');
  });

  it('직접 입력한 코드가 없으면 그 절을 만들지 않는다', () => {
    const markdown = buildFakeResultMarkdown({ prompt: '요청', commits: [] });

    expect(markdown).not.toContain('직접 입력한 코드');
  });
});
