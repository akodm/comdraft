import { describe, expect, it } from 'vitest';
import {
  AGENT_SUGGESTION_LIMIT,
  agentSuggestionsFor,
} from '@/lib/admin/agent-suggestions';
import { canPerform } from '@/lib/admin/roles';
import { ADMIN_ROLES } from '@/lib/db/schema/admin';

// 메시지 내용 대신 id 로 비교 (문구가 바뀌어도 권한 배치는 그대로 확인)
const idsFor = (role: (typeof ADMIN_ROLES)[number]) =>
  agentSuggestionsFor(role).map((suggestion) => suggestion.id);

describe('에이전트 기본 제안', () => {
  it('guest 에게는 제안이 없다', () => {
    expect(idsFor('guest')).toEqual([]);
  });

  it('viewer 는 조회 제안만 받는다', () => {
    expect(idsFor('viewer')).toEqual([
      'weekly-stats',
      'active-jobs',
      'recent-users',
    ]);
  });

  it('editor 는 조치 제안을 먼저 받는다', () => {
    expect(idsFor('editor')).toEqual([
      'ban-post',
      'reset-usage',
      'weekly-stats',
      'active-jobs',
    ]);
  });

  it('admin 은 중대 조치 제안을 먼저 받는다', () => {
    expect(idsFor('admin')).toEqual([
      'ai-pause',
      'ban-post',
      'reset-usage',
      'weekly-stats',
    ]);
  });

  it.each(ADMIN_ROLES)(
    '%s 의 제안은 모두 그 권한으로 할 수 있는 일이고 개수 상한을 넘지 않는다',
    (role) => {
      const suggestions = agentSuggestionsFor(role);

      expect(suggestions.length).toBeLessThanOrEqual(AGENT_SUGGESTION_LIMIT);
      expect(
        suggestions.every((suggestion) => canPerform(role, suggestion.action)),
      ).toBe(true);
    },
  );
});
