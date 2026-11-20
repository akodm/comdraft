import { describe, expect, it } from 'vitest';
import { summarizeClaudeStatus } from '@/lib/admin/claude-status';

const summary = ({
  api = 'operational',
  indicator = 'none',
  description = 'All Systems Operational',
  incidents = [] as Array<{ name: string; impact: string; status: string }>,
} = {}) => ({
  page: { url: 'https://status.claude.com' },
  status: { indicator, description },
  components: [
    { name: 'claude.ai', status: 'operational', group: false },
    { name: 'Claude API (api.anthropic.com)', status: api, group: false },
    { name: 'Claude Code', status: 'operational', group: false },
    { name: 'Claude on Cloud Platforms', status: 'operational', group: true },
  ],
  incidents,
});

describe('summarizeClaudeStatus', () => {
  it('Claude API 가 정상이면 good', () => {
    expect(summarizeClaudeStatus(summary())).toMatchObject({
      level: 'good',
      apiStatus: 'operational',
      overall: 'All Systems Operational',
      incidents: [],
    });
  });

  it.each([
    ['degraded_performance', 'warning'],
    ['partial_outage', 'serious'],
    ['major_outage', 'critical'],
    ['under_maintenance', 'maintenance'],
  ])('Claude API 가 %s 이면 %s', (api, level) => {
    expect(summarizeClaudeStatus(summary({ api })).level).toBe(level);
  });

  it('색은 comdraft 가 쓰는 Claude API 기준 (다른 서비스 장애는 툴팁에만)', () => {
    const result = summarizeClaudeStatus(
      summary({
        indicator: 'major',
        description: 'Major System Outage',
        incidents: [
          {
            name: 'claude.ai login errors',
            impact: 'major',
            status: 'investigating',
          },
        ],
      }),
    );

    expect(result.level).toBe('good');
    expect(result.overall).toBe('Major System Outage');
    expect(result.incidents).toEqual([
      {
        name: 'claude.ai login errors',
        impact: 'major',
        status: 'investigating',
      },
    ]);
  });

  it('모양이 다르거나 Claude API 가 없으면 unknown', () => {
    expect(summarizeClaudeStatus(null).level).toBe('unknown');
    expect(summarizeClaudeStatus({ components: 'x' }).level).toBe('unknown');
    expect(summarizeClaudeStatus({ ...summary(), components: [] }).level).toBe(
      'unknown',
    );
  });

  it('진행 중인 사건은 최대 3개, 이름은 120자로 자름', () => {
    const incidents = Array.from({ length: 5 }, (_, index) => ({
      name: `${'x'.repeat(200)}${index}`,
      impact: 'minor',
      status: 'monitoring',
    }));
    const result = summarizeClaudeStatus(summary({ incidents }));

    expect(result.incidents).toHaveLength(3);
    expect(result.incidents[0].name.length).toBe(120);
  });
});
