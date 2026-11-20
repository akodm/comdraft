import { type AdminAction, canPerform } from '@/lib/admin/roles';
import type { AdminRole } from '@/lib/db/schema/admin';

/**
 * 어드민 에이전트 위젯의 기본 제안 (어떤 제안을 보여 줄지만 정함, 문구는 콘솔 레이아웃의 Lingui 메시지)
 * - 제안마다 그 일을 하는 데 필요한 조치(action)를 두고, 권한 표(canPerform)로 거름
 *   → 할 수 없는 일은 제안하지 않음 (에이전트 도구의 access 와 같은 기준)
 * - 높은 권한의 일이 먼저 오도록 정렬된 순서대로 앞에서부터 상한만큼 보여 줌
 *   → viewer 는 조회, editor 는 조치 먼저, admin 은 중대 조치 먼저
 */

export const AGENT_SUGGESTION_LIMIT = 4;

export const AGENT_SUGGESTION_IDS = [
  'ai-pause',
  'ban-post',
  'reset-usage',
  'weekly-stats',
  'active-jobs',
  'recent-users',
] as const;

export type AgentSuggestionId = (typeof AGENT_SUGGESTION_IDS)[number];

export interface AgentSuggestion {
  id: AgentSuggestionId;
  action: AdminAction;
}

// 높은 권한 → 낮은 권한 순서
const SUGGESTIONS: AgentSuggestion[] = [
  { id: 'ai-pause', action: 'ai.pause' },
  { id: 'ban-post', action: 'post.ban' },
  { id: 'reset-usage', action: 'user.resetUsage' },
  { id: 'weekly-stats', action: 'view' },
  { id: 'active-jobs', action: 'view' },
  { id: 'recent-users', action: 'view' },
];

export function agentSuggestionsFor(role: AdminRole): AgentSuggestion[] {
  return SUGGESTIONS.filter((suggestion) =>
    canPerform(role, suggestion.action),
  ).slice(0, AGENT_SUGGESTION_LIMIT);
}
