import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));

import {
  parsePushEvent,
  planPushEvent,
  verifyWebhookSignature,
  type PushEvent,
} from '@/lib/auto-draft/webhook';

const SECRET = 'test-secret';
const BODY = '{"hello":"world"}';

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyWebhookSignature', () => {
  it('맞는 서명은 true', () => {
    expect(verifyWebhookSignature(SECRET, BODY, sign(BODY))).toBe(true);
  });

  it('한 글자가 다르면 false', () => {
    const header = sign(BODY);
    const last = header.endsWith('0') ? '1' : '0';
    expect(
      verifyWebhookSignature(SECRET, BODY, header.slice(0, -1) + last),
    ).toBe(false);
  });

  it('sha1= 접두사는 false', () => {
    const hex = createHmac('sha1', SECRET).update(BODY).digest('hex');
    expect(verifyWebhookSignature(SECRET, BODY, `sha1=${hex}`)).toBe(false);
  });

  it('헤더가 없으면 false', () => {
    expect(verifyWebhookSignature(SECRET, BODY, null)).toBe(false);
  });

  it('길이가 다르면 throw 없이 false', () => {
    expect(verifyWebhookSignature(SECRET, BODY, 'sha256=abcd')).toBe(false);
  });

  it('다른 시크릿이면 false', () => {
    expect(verifyWebhookSignature(SECRET, BODY, sign(BODY, 'other'))).toBe(
      false,
    );
  });
});

const HEAD = 'f'.repeat(40);
const ZERO_SHA = '0'.repeat(40);

const payload = {
  ref: 'refs/heads/main',
  after: HEAD,
  forced: false,
  sender: { id: 42 },
  repository: { id: 7 },
  commits: [{ id: 'a1', message: 'feat: x' }],
};

describe('parsePushEvent', () => {
  it('필드를 뽑아 낸다', () => {
    expect(parsePushEvent(payload)).toEqual({
      ref: 'refs/heads/main',
      after: HEAD,
      forced: false,
      senderId: 42,
      repositoryId: 7,
      commits: [{ id: 'a1', message: 'feat: x' }],
    });
  });

  it('commits 가 빈 배열이어도 파싱', () => {
    expect(parsePushEvent({ ...payload, commits: [] })?.commits).toEqual([]);
  });

  it('refs/tags 도 그대로 파싱', () => {
    expect(parsePushEvent({ ...payload, ref: 'refs/tags/v1' })?.ref).toBe(
      'refs/tags/v1',
    );
  });

  it('필드가 빠지거나 타입이 틀리면 null', () => {
    expect(parsePushEvent(null)).toBeNull();
    expect(parsePushEvent('x')).toBeNull();
    expect(parsePushEvent({ ...payload, ref: undefined })).toBeNull();
    expect(parsePushEvent({ ...payload, forced: 'no' })).toBeNull();
    expect(parsePushEvent({ ...payload, sender: {} })).toBeNull();
    expect(parsePushEvent({ ...payload, repository: undefined })).toBeNull();
    expect(parsePushEvent({ ...payload, commits: undefined })).toBeNull();
    expect(parsePushEvent({ ...payload, commits: [{ id: 'a' }] })).toBeNull();
  });

  it('after(푸시 끝 SHA) 가 없거나 40자리 16진수가 아니면 null', () => {
    expect(parsePushEvent({ ...payload, after: undefined })).toBeNull();
    expect(parsePushEvent({ ...payload, after: 'abc' })).toBeNull();
    expect(parsePushEvent({ ...payload, after: 'g'.repeat(40) })).toBeNull();
    expect(parsePushEvent({ ...payload, after: 1 })).toBeNull();
  });
});

const target = { branch: 'main', githubAccountId: '42' };

function event(overrides: Partial<PushEvent> = {}): PushEvent {
  return {
    ref: 'refs/heads/main',
    after: HEAD,
    forced: false,
    senderId: 42,
    repositoryId: 7,
    commits: [{ id: 'a1', message: '[comdraft] short' }],
    ...overrides,
  };
}

describe('planPushEvent', () => {
  it('트리거 커밋이면 trigger, 푸시 끝 SHA 와 트리거를 함께', () => {
    expect(planPushEvent(event(), target)).toEqual({
      kind: 'trigger',
      headSha: HEAD,
      trigger: { sha: 'a1', options: { length: 'short' } },
    });
  });

  it('브랜치 삭제 푸시(after 가 0, 커밋 없음)는 ignore', () => {
    const e = parsePushEvent({ ...payload, after: ZERO_SHA, commits: [] });
    expect(e).not.toBeNull();
    if (!e) throw new Error();
    expect(planPushEvent(e, target)).toEqual({ kind: 'ignore' });
  });

  it('대상 브랜치가 아니면 ignore', () => {
    expect(planPushEvent(event({ ref: 'refs/heads/dev' }), target)).toEqual({
      kind: 'ignore',
    });
    expect(planPushEvent(event({ ref: 'refs/tags/main' }), target)).toEqual({
      kind: 'ignore',
    });
  });

  it('다른 사람의 푸시는 무시', () => {
    expect(planPushEvent(event({ senderId: 43 }), target)).toEqual({
      kind: 'ignore',
    });
  });

  it('forced 면 트리거가 있어도 exclude_forced', () => {
    const e = event({
      forced: true,
      commits: [
        { id: 'a1', message: '[comdraft]' },
        { id: 'a2', message: 'chore' },
      ],
    });
    expect(planPushEvent(e, target)).toEqual({
      kind: 'exclude_forced',
      shas: ['a1', 'a2'],
    });
  });

  it('forced 인데 커밋이 없으면 ignore', () => {
    expect(planPushEvent(event({ forced: true, commits: [] }), target)).toEqual(
      { kind: 'ignore' },
    );
  });

  it('트리거가 없으면 ignore', () => {
    expect(
      planPushEvent(
        event({ commits: [{ id: 'a1', message: 'feat: x' }] }),
        target,
      ),
    ).toEqual({ kind: 'ignore' });
  });

  it('트리거가 여럿이면 페이로드 마지막(가장 최신) 트리거 하나, 옵션도 그 커밋 것', () => {
    const e = event({
      commits: [
        { id: 'a1', message: '[comdraft] short' },
        { id: 'a2', message: 'chore' },
        { id: 'a3', message: '[comdraft] long' },
        { id: 'a4', message: 'fix' },
      ],
    });
    expect(planPushEvent(e, target)).toEqual({
      kind: 'trigger',
      headSha: HEAD,
      trigger: { sha: 'a3', options: { length: 'long' } },
    });
  });

  it('PR 머지 푸시: 머지로 들어온 커밋·머지 커밋·GitHub 가 만든 커밋도 트리거 후보', () => {
    const merged = 'e'.repeat(40);
    // PR 안의 [comdraft] 커밋
    expect(
      planPushEvent(
        event({
          after: merged,
          commits: [
            { id: 'f1', message: 'feat: x' },
            { id: 'f2', message: '[comdraft] friendly' },
            { id: 'm', message: 'Merge pull request #3 from o/feat' },
          ],
        }),
        target,
      ),
    ).toEqual({
      kind: 'trigger',
      headSha: merged,
      trigger: { sha: 'f2', options: { tone: 'friendly' } },
    });
    // 제목을 [comdraft] 로 고친 머지 커밋이 가장 최신
    expect(
      planPushEvent(
        event({
          after: merged,
          commits: [
            { id: 'f1', message: '[comdraft] short' },
            { id: 'm', message: '[comdraft] long\n\nMerge pull request #3' },
          ],
        }),
        target,
      ),
    ).toEqual({
      kind: 'trigger',
      headSha: merged,
      trigger: { sha: 'm', options: { length: 'long' } },
    });
    // squash 머지 커밋 (web-flow, 제목은 PR 제목)
    expect(
      planPushEvent(
        event({
          commits: [{ id: 's', message: '[comdraft] lecture (#3)' }],
        }),
        target,
      ),
    ).toEqual({
      kind: 'trigger',
      headSha: HEAD,
      trigger: { sha: 's', options: { postType: 'lecture' } },
    });
  });
});
