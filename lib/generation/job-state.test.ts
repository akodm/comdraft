import { describe, expect, it } from 'vitest';
import {
  isJobLocking,
  isJobResumable,
  RECENT_FAILURE_MS,
} from '@/lib/generation/job-state';

const now = new Date('2026-11-11T12:00:00Z');

describe('isJobLocking', () => {
  it('초안 작성 작업은 진행 중이거나 반영 전 완료면 잠근다', () => {
    expect(
      isJobLocking({ kind: 'draft', status: 'running', applied: false }),
    ).toBe(true);
    expect(
      isJobLocking({ kind: 'draft', status: 'completed', applied: false }),
    ).toBe(true);
    expect(
      isJobLocking({ kind: 'draft', status: 'completed', applied: true }),
    ).toBe(false);
  });

  it('빈칸 채우기 작업은 편집기를 잠그지 않는다', () => {
    expect(
      isJobLocking({ kind: 'fill', status: 'queued', applied: false }),
    ).toBe(false);
    expect(
      isJobLocking({ kind: 'fill', status: 'running', applied: false }),
    ).toBe(false);
    expect(
      isJobLocking({ kind: 'fill', status: 'completed', applied: false }),
    ).toBe(false);
  });
});

describe('isJobResumable', () => {
  const job = (overrides: Partial<Parameters<typeof isJobResumable>[0]>) => ({
    kind: 'fill' as const,
    status: 'running' as const,
    applied: false,
    finishedAt: null,
    ...overrides,
  });

  it('진행 중인 빈칸 채우기는 종류와 무관하게 이어 본다', () => {
    expect(isJobResumable(job({ status: 'queued' }), now)).toBe(true);
    expect(isJobResumable(job({ status: 'running' }), now)).toBe(true);
  });

  it('최근에 실패한 빈칸 채우기는 이어 보고, 오래된 실패와 반영한 완료는 아니다', () => {
    const recent = new Date(now.getTime() - 1000).toISOString();
    const old = new Date(now.getTime() - RECENT_FAILURE_MS - 1).toISOString();

    expect(
      isJobResumable(job({ status: 'failed', finishedAt: recent }), now),
    ).toBe(true);
    expect(
      isJobResumable(job({ status: 'failed', finishedAt: old }), now),
    ).toBe(false);
    expect(
      isJobResumable(job({ status: 'completed', applied: true }), now),
    ).toBe(false);
  });
});
