import 'server-only';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import {
  CLAUDE_STATUS_API,
  CLAUDE_STATUS_URL,
  type ClaudeStatus,
  type ClaudeStatusLevel,
  summarizeClaudeStatus,
  UNKNOWN_CLAUDE_STATUS,
} from '@/lib/admin/claude-status';
import { initLingui } from '@/lib/i18n/server';

/**
 * 어드민 헤더의 Claude 상태 신호등 (status.claude.com)
 * - 화면을 새로 열 때마다 한 번 읽음 (폴링 없음, 캐시 없음)
 * - 상태 페이지가 느리거나 실패해도 콘솔을 막지 않도록 3초 제한, 실패는 회색(확인 불가)
 * - 색만으로 읽지 않도록 툴팁과 스크린 리더 문구에 상태 이름을 함께 둠
 */

const FETCH_TIMEOUT_MS = 3000;

// 상태 색 (dataviz 상태 팔레트: good / warning / serious / critical, 점검은 브랜드 파랑, 모름은 회색)
const LEVEL_COLOR: Record<ClaudeStatusLevel, string> = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  maintenance: 'var(--color-brand)',
  unknown: 'var(--color-ink-subtle)',
};

const LEVEL_LABEL: Record<ClaudeStatusLevel | 'loading', MessageDescriptor> = {
  good: msg`정상`,
  warning: msg`성능 저하`,
  serious: msg`일부 장애`,
  critical: msg`장애`,
  maintenance: msg`점검 중`,
  unknown: msg`확인 불가`,
  loading: msg`확인 중`,
};

async function fetchClaudeStatus(): Promise<ClaudeStatus> {
  try {
    const response = await fetch(CLAUDE_STATUS_API, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      return UNKNOWN_CLAUDE_STATUS;
    }

    return summarizeClaudeStatus(await response.json());
  } catch {
    return UNKNOWN_CLAUDE_STATUS;
  }
}

interface StatusDotProps {
  level: ClaudeStatusLevel | 'loading';
  status?: ClaudeStatus;
}

async function StatusDot({ level, status }: StatusDotProps) {
  const i18n = await initLingui();
  const label = i18n._(LEVEL_LABEL[level]);
  const color = level === 'loading' ? LEVEL_COLOR.unknown : LEVEL_COLOR[level];

  return (
    <a
      href={CLAUDE_STATUS_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="group relative flex items-center gap-1.5 px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand"
      aria-label={i18n._(msg`Claude 상태: ${label}`)}
    >
      <span
        aria-hidden
        className={`size-2.5 rounded-full ring-2 ring-white ${
          level === 'loading' ? 'animate-pulse' : ''
        }`}
        style={{ backgroundColor: color }}
      />
      <span aria-hidden className="text-[11px] text-ink-faint">
        Claude
      </span>

      {/* 툴팁: 마우스를 올리거나 키보드로 고르면 보임 */}
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute top-full left-0 z-50 mt-1.5 w-72 border border-line bg-panel p-3 text-left text-[12px] leading-[1.5] text-ink opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          {i18n._(msg`Claude API: ${label}`)}
        </span>
        {status?.overall ? (
          <span className="mt-1 block text-ink-muted">
            {i18n._(msg`전체: ${status.overall}`)}
          </span>
        ) : null}
        {status && status.incidents.length > 0 ? (
          <span className="mt-2 block">
            <span className="block text-ink-muted">
              {i18n._(msg`진행 중인 사건`)}
            </span>
            {status.incidents.map((incident) => (
              <span key={incident.name} className="mt-0.5 block">
                · {incident.name}
                <span className="text-ink-faint">
                  {' '}
                  ({incident.impact}, {incident.status})
                </span>
              </span>
            ))}
          </span>
        ) : null}
        {level === 'unknown' ? (
          <span className="mt-1 block text-ink-muted">
            {i18n._(msg`상태 페이지를 불러오지 못했어요.`)}
          </span>
        ) : null}
        <span className="mt-2 block text-ink-faint">
          {i18n._(msg`눌러서 status.claude.com 열기`)}
        </span>
      </span>
    </a>
  );
}

/** 상태를 읽어 신호등을 그림 (Suspense 안에서 씀) */
export default async function ClaudeStatusIndicator() {
  const status = await fetchClaudeStatus();

  return <StatusDot level={status.level} status={status} />;
}

/** 읽는 동안 보여 줄 회색 신호등 (Suspense fallback) */
export async function ClaudeStatusIndicatorLoading() {
  return <StatusDot level="loading" />;
}
