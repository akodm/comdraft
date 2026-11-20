import { anthropic } from '@ai-sdk/anthropic';
import { defineAgent, defineTool } from 'dopus';
import { z } from 'zod';
import app, { locales } from '@/agent/prompts/app';
import preset from '@/agent/prompts/preset';
import { adminTools } from '@/agent/tools/admin';
import { canPerform } from '@/lib/admin/roles';
import { getAdminSession } from '@/lib/admin/session';
import type { AdminRole } from '@/lib/db/schema/admin';

// identify 가 돌려주는 어드민 정보 (access·runtime 에서 형변환 없이 씀)
declare module 'dopus' {
  interface AgentUser {
    loginId: string;
    role: AdminRole;
  }
}

/**
 * 기존 서버 함수를 도구로 등록 (에이전트 요청 안에서 실행되므로 쿠키·권한 확인이 그대로 적용됨)
 * - 데이터를 바꾸는 도구는 `confirm: true` 로 채팅에서 매번 승인받음
 * - 등록할 함수는 함수 안에서 requireAdmin 으로 권한을 확인해야 함 (페이지를 거치지 않음)
 */
export default defineAgent({
  model: anthropic('claude-sonnet-5-5'),
  tools: {
    currentTime: defineTool(async () => new Date().toISOString(), {
      description: 'Returns the current date and time (ISO 8601, server time).',
      usage: 'When the answer depends on today’s date or the current time.',
      input: z.object({}),
    }),
    // 어드민 콘솔의 조회·조치 전부 (권한별 access, 바꾸는 도구는 confirm) — agent/tools/admin.ts
    ...adminTools,
  },
  // 요청한 어드민: 콘솔에 들어갈 수 있는 세션만 (로그아웃·임시 비밀번호 단계·guest 는 undefined)
  identify: async () => {
    const session = await getAdminSession();

    return session?.next === 'console' && canPerform(session.role, 'view')
      ? { id: session.adminId, loginId: session.loginId, role: session.role }
      : undefined;
  },
  // /api/agent 는 어드민 주소 밖에 있으므로, 어드민이 아니면 모델을 부르기 전에 401 (비용·노출 방지)
  requireUser: true,
  // 모델에 알려 줄 요청마다의 사실: 지금 묻는 사람은 어드민 계정이며 서비스 사용자가 아님
  // (identify 값은 모델에 그대로 가지 않으므로, 없으면 도구 결과에서 서비스 사용자를 본인으로 짐작함)
  runtime: (_, { user }) =>
    user
      ? {
          'Signed-in admin (admin console account, not a service user)': `${user.loginId} (role: ${user.role})`,
        }
      : {},
  // 프롬프트 층 (안정 → 요청마다): dopus 기본 규칙 → preset → app → runtime
  prompt: { preset, app, locales },
});
