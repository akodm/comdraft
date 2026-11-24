import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseTrigger, type TriggerOptions } from '@/lib/auto-draft/trigger';

const SIGNATURE_PATTERN = /^sha256=[0-9a-f]{64}$/i;

export interface PushEvent {
  ref: string;
  forced: boolean;
  senderId: number;
  repositoryId: number;
  commits: Array<{ id: string; message: string }>;
}

export type PushPlan =
  | { kind: 'ignore' }
  | { kind: 'exclude_forced'; shas: string[] }
  | { kind: 'trigger'; triggerSha: string; options: TriggerOptions };

// X-Hub-Signature-256 헤더를 원본 본문으로 검증 (절대 throw 하지 않음)
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  header: string | null,
): boolean {
  if (!header || !SIGNATURE_PATTERN.test(header)) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(header.slice('sha256='.length), 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// push 페이로드에서 필요한 필드만 추출, 하나라도 없거나 타입이 다르면 null
export function parsePushEvent(payload: unknown): PushEvent | null {
  if (!isRecord(payload)) return null;
  const { ref, forced, sender, repository, commits } = payload;

  if (typeof ref !== 'string' || typeof forced !== 'boolean') return null;
  if (!isRecord(sender) || typeof sender.id !== 'number') return null;
  if (!isRecord(repository) || typeof repository.id !== 'number') return null;
  if (!Array.isArray(commits)) return null;

  const parsed: PushEvent['commits'] = [];
  for (const commit of commits) {
    if (
      !isRecord(commit) ||
      typeof commit.id !== 'string' ||
      typeof commit.message !== 'string'
    ) {
      return null;
    }
    parsed.push({ id: commit.id, message: commit.message });
  }

  return {
    ref,
    forced,
    senderId: sender.id,
    repositoryId: repository.id,
    commits: parsed,
  };
}

// 연결된 대상 하나에 대해 push 를 어떻게 처리할지 판정 (커밋은 오래된 순)
export function planPushEvent(
  event: PushEvent,
  target: { branch: string; githubAccountId: string },
): PushPlan {
  if (event.ref !== `refs/heads/${target.branch}`) return { kind: 'ignore' };
  if (String(event.senderId) !== target.githubAccountId) {
    return { kind: 'ignore' };
  }

  // 강제 푸시는 트리거가 있어도 실행하지 않고 SHA 만 제외 처리
  if (event.forced) {
    if (event.commits.length === 0) return { kind: 'ignore' };
    return { kind: 'exclude_forced', shas: event.commits.map((c) => c.id) };
  }

  // 가장 최신(마지막) 트리거 커밋을 기준으로 삼음
  for (let i = event.commits.length - 1; i >= 0; i -= 1) {
    const commit = event.commits[i];
    const options = parseTrigger(commit.message);
    if (options) return { kind: 'trigger', triggerSha: commit.id, options };
  }
  return { kind: 'ignore' };
}
