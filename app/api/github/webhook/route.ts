import { after, type NextRequest } from 'next/server';
import { runAutoDraft } from '@/lib/auto-draft/run';
import { excludeCommits, findPushTargets } from '@/lib/auto-draft/store';
import {
  parsePushEvent,
  planPushEvent,
  verifyWebhookSignature,
} from '@/lib/auto-draft/webhook';
import { getGithubWebhookSecret } from '@/lib/github/env';

const BRANCH_REF_PREFIX = 'refs/heads/';

// 자동 초안 실행은 응답 뒤에 이어지므로 넉넉한 시간을 줌
export const maxDuration = 300;

/**
 * GitHub push 웹훅 수신 (커밋 트리거 자동 초안)
 * - 서명은 파싱 전의 원문 본문으로 검증 (틀리면 401)
 * - ping·push 외 이벤트, 브랜치가 아닌 ref 는 200 으로 무시
 * - 트리거가 있으면 응답 뒤에 초안 생성을 이어가고 202, 없으면 200
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (
    !verifyWebhookSignature(
      getGithubWebhookSecret(),
      rawBody,
      request.headers.get('x-hub-signature-256'),
    )
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (request.headers.get('x-github-event') !== 'push') {
    return Response.json({ status: 'ignored' });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const event = parsePushEvent(payload);

  if (!event) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  // 태그 등 브랜치가 아닌 ref 는 대상이 아님
  if (!event.ref.startsWith(BRANCH_REF_PREFIX)) {
    return Response.json({ status: 'ignored' });
  }

  const branch = event.ref.slice(BRANCH_REF_PREFIX.length);
  const targets = await findPushTargets(event.repositoryId, branch);
  let scheduled = 0;

  for (const target of targets) {
    const plan = planPushEvent(event, {
      branch,
      githubAccountId: target.githubAccountId,
    });

    if (plan.kind === 'exclude_forced') {
      await excludeCommits(
        target.userId,
        target.repositoryId,
        plan.shas,
        'force_push',
      );
    }

    if (plan.kind === 'trigger') {
      scheduled += 1;
      after(async () => {
        try {
          await runAutoDraft(target, plan.triggerSha, plan.options);
        } catch (error) {
          // 실패 기록은 실행기가 남김 → 여기는 예상 밖 오류만 (커밋 내용은 남기지 않음)
          console.error('자동 초안 실행 중 예상하지 못한 오류', error);
        }
      });
    }
  }

  return Response.json(
    { status: scheduled > 0 ? 'accepted' : 'ok' },
    { status: scheduled > 0 ? 202 : 200 },
  );
}
