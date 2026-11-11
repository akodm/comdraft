import { describe, expect, it } from 'vitest';
import {
  isFillPending,
  isJobLocking,
  isJobResumable,
  RECENT_FAILURE_MS,
  shouldWatchJob,
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

describe('isFillPending', () => {
  it('빈칸 채우기는 진행 중이거나 편집기가 아직 넣지 않은 완료면 그 빈칸을 막는다', () => {
    expect(
      isFillPending({ kind: 'fill', status: 'queued', applied: false }),
    ).toBe(true);
    expect(
      isFillPending({ kind: 'fill', status: 'running', applied: false }),
    ).toBe(true);
    expect(
      isFillPending({ kind: 'fill', status: 'completed', applied: false }),
    ).toBe(true);
  });

  it('넣은 완료·실패와 초안 작성 작업은 아니다', () => {
    expect(
      isFillPending({ kind: 'fill', status: 'completed', applied: true }),
    ).toBe(false);
    expect(
      isFillPending({ kind: 'fill', status: 'failed', applied: false }),
    ).toBe(false);
    expect(
      isFillPending({ kind: 'draft', status: 'running', applied: false }),
    ).toBe(false);
  });
});

describe('shouldWatchJob', () => {
  it('진행 중인 빈칸 채우기도 구독·조회한다 (편집기를 잠그지 않아도)', () => {
    expect(
      shouldWatchJob({ kind: 'fill', status: 'queued', applied: false }),
    ).toBe(true);
    expect(
      shouldWatchJob({ kind: 'fill', status: 'running', applied: false }),
    ).toBe(true);
  });

  it('끝난 빈칸 채우기는 더 조회하지 않는다', () => {
    expect(
      shouldWatchJob({ kind: 'fill', status: 'completed', applied: false }),
    ).toBe(false);
    expect(
      shouldWatchJob({ kind: 'fill', status: 'failed', applied: false }),
    ).toBe(false);
  });

  it('초안 작성은 잠그는 동안 조회한다', () => {
    expect(
      shouldWatchJob({ kind: 'draft', status: 'completed', applied: false }),
    ).toBe(true);
    expect(
      shouldWatchJob({ kind: 'draft', status: 'completed', applied: true }),
    ).toBe(false);
  });
});
