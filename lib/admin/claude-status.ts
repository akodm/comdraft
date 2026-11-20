/**
 * Claude 상태 페이지(status.claude.com, Statuspage API) 요약 (어드민 헤더 표시용 순수 함수)
 * - 색은 comdraft 가 실제로 쓰는 "Claude API (api.anthropic.com)" 상태로 정함
 *   → claude.ai 같은 다른 서비스 장애는 툴팁에만 보여 줌
 * - 응답 모양이 다르거나 Claude API 항목이 없으면 unknown (빨간불로 오해하지 않게 회색)
 */

export const CLAUDE_STATUS_URL = 'https://status.claude.com';
export const CLAUDE_STATUS_API = `${CLAUDE_STATUS_URL}/api/v2/summary.json`;

// 상태 페이지에서 comdraft 가 의존하는 항목 이름
const API_COMPONENT = 'Claude API (api.anthropic.com)';
const MAX_INCIDENTS = 3;
const MAX_INCIDENT_NAME = 120;

export type ClaudeStatusLevel =
  | 'good'
  | 'warning'
  | 'serious'
  | 'critical'
  | 'maintenance'
  | 'unknown';

export interface ClaudeIncident {
  name: string;
  impact: string;
  status: string;
}

export interface ClaudeStatus {
  level: ClaudeStatusLevel;
  // Claude API 항목의 원래 상태 값 (operational 등), 없으면 null
  apiStatus: string | null;
  // 전체 상태 문구 (예: All Systems Operational)
  overall: string | null;
  incidents: ClaudeIncident[];
}

const LEVEL_BY_COMPONENT_STATUS: Record<string, ClaudeStatusLevel> = {
  operational: 'good',
  degraded_performance: 'warning',
  partial_outage: 'serious',
  major_outage: 'critical',
  under_maintenance: 'maintenance',
};

export const UNKNOWN_CLAUDE_STATUS: ClaudeStatus = {
  level: 'unknown',
  apiStatus: null,
  overall: null,
  incidents: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

export function summarizeClaudeStatus(json: unknown): ClaudeStatus {
  if (!isRecord(json) || !Array.isArray(json.components)) {
    return UNKNOWN_CLAUDE_STATUS;
  }

  const api = json.components.find(
    (component) => isRecord(component) && component.name === API_COMPONENT,
  );

  if (!isRecord(api)) {
    return UNKNOWN_CLAUDE_STATUS;
  }

  const apiStatus = text(api.status);
  const overall = isRecord(json.status) ? text(json.status.description) : '';
  const incidents = Array.isArray(json.incidents)
    ? json.incidents
        .filter(isRecord)
        .slice(0, MAX_INCIDENTS)
        .map((incident) => ({
          name: text(incident.name).slice(0, MAX_INCIDENT_NAME),
          impact: text(incident.impact),
          status: text(incident.status),
        }))
    : [];

  return {
    level: LEVEL_BY_COMPONENT_STATUS[apiStatus] ?? 'unknown',
    apiStatus: apiStatus || null,
    overall: overall || null,
    incidents,
  };
}
