import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';
import {
  maskSecrets,
  scrubBreadcrumb,
  scrubEvent,
  scrubMessage,
  stripQuery,
} from '@/lib/observability/scrub';

describe('maskSecrets', () => {
  it('GitHub 토큰, sk- 키, Bearer 값, 접속 정보, JWT 를 가림', () => {
    const text = [
      'token ghu_abcdefghijklmnopqrstuvwxyz0123',
      'pat github_pat_11ABCDEFG0123456789_abcdefghij',
      'key sk-ant-api03-abcdefghijklmnopqrstuvwx',
      'Authorization: Bearer abcdef1234567890xyz',
      'postgresql://comdraft.ref:s3cret-pass@pooler.supabase.com:6543/postgres',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk',
    ].join('\n');

    const masked = maskSecrets(text);

    expect(masked).not.toContain('ghu_abcdefghijklmnopqrstuvwxyz0123');
    expect(masked).not.toContain('github_pat_11ABCDEFG');
    expect(masked).not.toContain('sk-ant-api03');
    expect(masked).not.toContain('abcdef1234567890xyz');
    expect(masked).not.toContain('s3cret-pass');
    expect(masked).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(masked).toContain('pooler.supabase.com');
  });

  it('평범한 문장은 그대로 둠', () => {
    expect(maskSecrets('GitHub API 요청 실패 (502)')).toBe(
      'GitHub API 요청 실패 (502)',
    );
  });
});

describe('scrubMessage', () => {
  it('Drizzle 오류의 params 뒤(저장 값)를 자름', () => {
    const message =
      'Failed query: update "comdraft"."draft" set "content" = $1 where "id" = $2\nparams: {"type":"doc","content":[{"text":"const secret = 1"}]},abc';

    expect(scrubMessage(message)).toBe(
      'Failed query: update "comdraft"."draft" set "content" = $1 where "id" = $2',
    );
  });

  it('긴 메시지는 500자로 자름', () => {
    const scrubbed = scrubMessage('a'.repeat(800));

    expect(scrubbed).toHaveLength(501);
    expect(scrubbed.endsWith('…')).toBe(true);
  });
});

describe('stripQuery', () => {
  it('쿼리와 해시를 지움', () => {
    expect(stripQuery('https://comdraft.dev/ko/posts?q=1#top')).toBe(
      'https://comdraft.dev/ko/posts',
    );
    expect(stripQuery('/api/x?token=abc')).toBe('/api/x');
  });
});

describe('scrubBreadcrumb', () => {
  it('콘솔 기록은 버림', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'hi' })).toBeNull();
  });

  it('주소의 쿼리와 본문을 지움', () => {
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: { url: '/api/a?code=1', method: 'POST', body: 'x' },
      }),
    ).toEqual({ category: 'fetch', data: { url: '/api/a', method: 'POST' } });

    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/ko?x=1', to: '/en#y' },
      }),
    ).toEqual({ category: 'navigation', data: { from: '/ko', to: '/en' } });
  });
});

describe('scrubEvent', () => {
  it('요청은 메서드와 쿼리 없는 주소만, 사용자는 id 만 남김', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://comdraft.dev/api/github/webhook?x=1',
        headers: { cookie: 'session=abc', authorization: 'Bearer xyz' },
        cookies: { session: 'abc' },
        data: '{"commits":[]}',
        query_string: 'x=1',
      },
      user: { id: 'user-1', email: 'a@b.c', ip_address: '1.2.3.4' },
      exception: {
        values: [
          { type: 'Error', value: 'bad ghp_abcdefghijklmnopqrstuvwxyz012345' },
        ],
      },
      breadcrumbs: [
        { category: 'console', message: 'secret' },
        { category: 'ui.click', message: 'button' },
      ],
    } as ErrorEvent);

    expect(event.request).toEqual({
      method: 'POST',
      url: 'https://comdraft.dev/api/github/webhook',
    });
    expect(event.user).toEqual({ id: 'user-1' });
    expect(event.exception?.values?.[0].value).toBe('bad [redacted]');
    expect(event.breadcrumbs).toEqual([
      { category: 'ui.click', message: 'button' },
    ]);
  });

  it('id 없는 사용자 정보는 지움', () => {
    const event = scrubEvent({
      type: undefined,
      user: { ip_address: '1.2.3.4' },
    } as ErrorEvent);

    expect(event.user).toBeUndefined();
  });
});
