import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Suspense } from 'react';
import AdminHeader from '@/components/admin/admin-header';
import ClaudeStatusIndicator, {
  ClaudeStatusIndicatorLoading,
} from '@/components/admin/claude-status-indicator';
import { AgentWidget } from '@/components/agent/agent-chat';
import AdminSidebar from '@/components/admin/admin-sidebar';
import {
  type AgentSuggestionId,
  agentSuggestionsFor,
} from '@/lib/admin/agent-suggestions';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import { getLocale, initLingui } from '@/lib/i18n/server';

// 에이전트 위젯 기본 제안 문구 (어떤 제안을 보여 줄지는 권한에 따라 agentSuggestionsFor 가 정함)
const SUGGESTION_MESSAGES: Record<AgentSuggestionId, MessageDescriptor> = {
  'ai-pause': msg`AI 작성 상태 확인하고 필요하면 멈추기`,
  'ban-post': msg`문제 있는 게시글 찾아서 밴하기`,
  'reset-usage': msg`사용량이 한도를 넘은 사용자 찾기`,
  'weekly-stats': msg`이번 주 통계 요약해 줘`,
  'active-jobs': msg`진행 중인 AI 작업 보여 줘`,
  'recent-users': msg`최근 가입한 사용자 목록 조회`,
};

/**
 * 어드민 콘솔 틀: 위 헤더, 왼쪽 사이드 메뉴, 오른쪽 넓은 본문 (푸터 없음)
 * - 레이아웃은 화면 이동 때 다시 그려지지 않으므로 각 페이지도 requireAdmin 으로 다시 확인
 * - 링크 주소는 주소 값(params)이 아닌 설정된 키로 만듦
 */
export default async function AdminConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const i18n = await initLingui();
  const lang = await getLocale();
  const session = await requireAdmin('view');
  const basePath = adminPath(lang, requireAdminKey());

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <AdminHeader
        lang={lang}
        loginId={session.loginId}
        role={session.role}
        passwordHref={`${basePath}/account/password`}
        status={
          // 상태 페이지 응답을 기다리는 동안에도 콘솔은 먼저 보이게 (새로고침마다 한 번 읽음)
          <Suspense fallback={<ClaudeStatusIndicatorLoading />}>
            <ClaudeStatusIndicator />
          </Suspense>
        }
      />
      <div className="flex flex-1 flex-col lg:flex-row">
        <AdminSidebar basePath={basePath} />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
      {/* 콘솔에 들어온 어드민에게만 (로그인·비밀번호 변경 화면에는 그리지 않음) */}
      <AgentWidget
        labels={{
          title: i18n._(msg`AI 어시스턴트`),
          placeholder: i18n._(msg`무엇이든 물어보세요...`),
        }}
        suggestions={agentSuggestionsFor(session.role).map(({ id }) =>
          i18n._(SUGGESTION_MESSAGES[id]),
        )}
      />
    </div>
  );
}
