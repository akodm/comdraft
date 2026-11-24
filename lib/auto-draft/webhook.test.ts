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

const payload = {
  ref: 'refs/heads/main',
  forced: false,
  sender: { id: 42 },
  repository: { id: 7 },
  commits: [{ id: 'a1', message: 'feat: x' }],
};

describe('parsePushEvent', () => {
  it('필드를 뽑아 낸다', () => {
    expect(parsePushEvent(payload)).toEqual({
      ref: 'refs/heads/main',
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
});

const target = { branch: 'main', githubAccountId: '42' };

function event(overrides: Partial<PushEvent> = {}): PushEvent {
  return {
    ref: 'refs/heads/main',
    forced: false,
    senderId: 42,
    repositoryId: 7,
    commits: [{ id: 'a1', message: '[comdraft] short' }],
    ...overrides,
  };
}

describe('planPushEvent', () => {
  it('트리거 커밋이면 trigger', () => {
    expect(planPushEvent(event(), target)).toEqual({
      kind: 'trigger',
      triggerSha: 'a1',
      options: { length: 'short' },
    });
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

  it('트리거가 둘이면 마지막(최신) 커밋', () => {
    const e = event({
      commits: [
        { id: 'a1', message: '[comdraft] short' },
        { id: 'a2', message: 'chore' },
        { id: 'a3', message: '[comdraft] long' },
        { id: 'a4', message: 'fix' },
      ],
    });
    const plan = planPushEvent(e, target);
    expect(plan).toMatchObject({ kind: 'trigger', triggerSha: 'a3' });
  });
});
