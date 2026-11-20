import { createAgentHandler } from 'dopus';
import agent from '@/agent.config';
import { checkAgentRequest } from '@/lib/admin/agent-request';

// Seconds this route may run (your platform's limit applies). Passing it lets the agent stop calling tools at
// 75% of it and answer with what it has, instead of being cut off mid-stream.
export const maxDuration = 60;

const handler = createAgentHandler(agent, { maxDuration });

// 승인 서명 비밀이 없거나, 다른 출처·JSON 이 아닌 요청은 dopus 에 넘기기 전에 거절 (lib/admin/agent-request.ts)
const REJECTED: Record<
  Exclude<ReturnType<typeof checkAgentRequest>, 'ok'>,
  number
> = {
  missing_secret: 503,
  cross_origin: 403,
  not_json: 415,
};

export async function POST(request: Request): Promise<Response> {
  const check = checkAgentRequest(request, {
    approvalSecret: process.env.DOPUS_APPROVAL_SECRET,
  });

  if (check !== 'ok') {
    return new Response(null, { status: REJECTED[check] });
  }

  return handler(request);
}
