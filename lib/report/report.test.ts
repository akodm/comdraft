import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildDailyReport } from '@/lib/report/format';
import {
  groupPagePaths,
  parseGa4Ranking,
  parseGa4Totals,
} from '@/lib/report/ga4';
import {
  buildServiceAccountAssertion,
  normalizePrivateKey,
} from '@/lib/report/google-auth';
import { getReportPeriod } from '@/lib/report/period';
import { summarizeSearchDays } from '@/lib/report/search-console';
import { buildSnsPublishBody, parseSnsRegion } from '@/lib/report/sns';

// 한국 시간 11/17(화) 08:05 에 실행
const NOW = new Date('2026-11-16T23:05:00Z');

describe('getReportPeriod', () => {
  it('한국 시간 기준으로 오늘·어제와 최근 7일·그 전 7일을 정한다', () => {
    const period = getReportPeriod(NOW);

    expect(period.reportDate).toBe('2026-11-17');
    expect(period.yesterday).toBe('2026-11-16');
    expect(period.dayBefore).toBe('2026-11-15');
    expect(period.last7).toEqual({ start: '2026-11-10', end: '2026-11-16' });
    expect(period.prev7).toEqual({ start: '2026-11-03', end: '2026-11-09' });
  });

  it('어제(한국 시간 하루)를 UTC 시각 범위로 돌려준다', () => {
    const { yesterdayRange } = getReportPeriod(NOW);

    expect(yesterdayRange.start.toISOString()).toBe('2026-11-15T15:00:00.000Z');
    expect(yesterdayRange.end.toISOString()).toBe('2026-11-16T15:00:00.000Z');
  });

  it('UTC 로는 아직 전날이어도 한국 날짜로 계산한다 (자정 직후)', () => {
    const period = getReportPeriod(new Date('2026-11-30T15:10:00Z'));

    expect(period.reportDate).toBe('2026-12-01');
    expect(period.yesterday).toBe('2026-11-30');
  });
});

describe('parseGa4Totals', () => {
  it('이름 붙인 기간별 합계를 읽고, 행이 없는 기간은 0 으로 둔다', () => {
    const totals = parseGa4Totals(
      {
        rows: [
          {
            dimensionValues: [{ value: 'yesterday' }],
            metricValues: [{ value: '22' }, { value: '23' }, { value: '37' }],
          },
          {
            dimensionValues: [{ value: 'last7' }],
            metricValues: [
              { value: '120' },
              { value: '130' },
              { value: '300' },
            ],
          },
        ],
      },
      ['yesterday', 'dayBefore', 'last7', 'prev7'],
    );

    expect(totals.yesterday).toEqual({
      activeUsers: 22,
      sessions: 23,
      pageViews: 37,
    });
    expect(totals.last7.pageViews).toBe(300);
    expect(totals.dayBefore).toEqual({
      activeUsers: 0,
      sessions: 0,
      pageViews: 0,
    });
  });
});

describe('parseGa4Ranking', () => {
  it('첫 차원 값과 첫 지표 값을 순위로 읽는다', () => {
    expect(
      parseGa4Ranking({
        rows: [
          {
            dimensionValues: [{ value: '/ko' }],
            metricValues: [{ value: '18' }],
          },
          {
            dimensionValues: [{ value: '/en' }],
            metricValues: [{ value: '4' }],
          },
        ],
      }),
    ).toEqual([
      { label: '/ko', value: 18 },
      { label: '/en', value: 4 },
    ]);
  });

  it('행이 없으면 빈 목록', () => {
    expect(parseGa4Ranking({})).toEqual([]);
  });
});

describe('groupPagePaths', () => {
  it('주소의 UUID 를 :id 로 묶어 합치고 상위 개수만 남긴다', () => {
    expect(
      groupPagePaths(
        [
          { label: '/en', value: 27 },
          {
            label:
              '/ko/dashboard/repositories/ffd5610a-8d0d-41c1-b65a-3c7a71ab7e7f/drafts/15ca4d4f-afb4-4af2-b1c2-26042b81f9ac',
            value: 7,
          },
          {
            label:
              '/ko/dashboard/repositories/0b7c2e4a-1111-4222-8333-944455556666/drafts/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            value: 5,
          },
          { label: '/ko', value: 15 },
          { label: '/ko/posts/hello-world-abc123', value: 1 },
        ],
        3,
      ),
    ).toEqual([
      { label: '/en', value: 27 },
      { label: '/ko', value: 15 },
      { label: '/ko/dashboard/repositories/:id/drafts/:id', value: 12 },
    ]);
  });
});

describe('summarizeSearchDays', () => {
  const day = (
    date: string,
    clicks: number,
    impressions: number,
    position = 0,
  ) => ({
    keys: [date],
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position,
  });

  it('가장 최근 날짜와 그날까지 7일, 그 전 7일을 합친다', () => {
    const summary = summarizeSearchDays([
      day('2026-11-01', 9, 90, 5),
      day('2026-11-07', 1, 10, 20),
      day('2026-11-08', 2, 40, 10),
      day('2026-11-14', 1, 10, 4),
    ]);

    expect(summary.latestDate).toBe('2026-11-14');
    expect(summary.latest).toEqual({
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      position: 4,
    });
    expect(summary.last7Range).toEqual({
      start: '2026-11-08',
      end: '2026-11-14',
    });
    // 노출 수로 가중한 평균 순위: (40×10 + 10×4) / 50 = 8.8
    expect(summary.last7).toEqual({
      clicks: 3,
      impressions: 50,
      ctr: 0.06,
      position: 8.8,
    });
    // 11/01 ~ 11/07
    expect(summary.prev7.impressions).toBe(100);
  });

  it('노출이 없으면 순위는 없음(null), CTR 은 0', () => {
    const summary = summarizeSearchDays([day('2026-11-14', 0, 0)]);

    expect(summary.latest).toEqual({
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: null,
    });
  });

  it('데이터가 없으면 최근 날짜도 없음', () => {
    expect(summarizeSearchDays([]).latestDate).toBeNull();
  });
});

describe('google-auth', () => {
  it('환경 변수에 \\n 글자로 들어온 줄바꿈을 실제 줄바꿈으로 바꾼다', () => {
    expect(
      normalizePrivateKey(
        '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n',
      ),
    ).toBe('-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----');
  });

  it('서비스 계정 JWT 를 RS256 으로 서명하고 1시간짜리 토큰을 요청한다', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const assertion = buildServiceAccountAssertion({
      clientEmail: 'reporter@example.iam.gserviceaccount.com',
      privateKey: pem,
      scopes: ['scope-a', 'scope-b'],
      now: NOW,
    });

    const [header, payload, signature] = assertion.split('.');
    const decode = (part: string) =>
      JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });

    const iat = Math.floor(NOW.getTime() / 1000);
    expect(decode(payload)).toEqual({
      iss: 'reporter@example.iam.gserviceaccount.com',
      scope: 'scope-a scope-b',
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp: iat + 3600,
    });

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${payload}`);
    expect(
      verifier.verify(publicKey, Buffer.from(signature, 'base64url')),
    ).toBe(true);
  });
});

describe('sns', () => {
  const TOPIC = 'arn:aws:sns:ap-northeast-2:123456789012:comdraft-daily-report';

  it('토픽 ARN 에서 리전을 읽는다', () => {
    expect(parseSnsRegion(TOPIC)).toBe('ap-northeast-2');
  });

  it('SNS 토픽 ARN 이 아니면 오류', () => {
    expect(() => parseSnsRegion('arn:aws:sqs:ap-northeast-2:1:q')).toThrow();
  });

  it('Publish 요청 본문을 폼 형식으로 만든다', () => {
    const body = new URLSearchParams(
      buildSnsPublishBody({
        topicArn: TOPIC,
        subject: 'Hello',
        message: '한글 본문',
      }),
    );

    expect(body.get('Action')).toBe('Publish');
    expect(body.get('Version')).toBe('2010-03-31');
    expect(body.get('TopicArn')).toBe(TOPIC);
    expect(body.get('Subject')).toBe('Hello');
    expect(body.get('Message')).toBe('한글 본문');
  });
});

describe('buildDailyReport', () => {
  const period = getReportPeriod(NOW);

  const traffic = {
    yesterday: { activeUsers: 22, sessions: 22, pageViews: 37 },
    dayBefore: { activeUsers: 21, sessions: 25, pageViews: 37 },
    last7: { activeUsers: 115, sessions: 120, pageViews: 300 },
    prev7: { activeUsers: 100, sessions: 100, pageViews: 250 },
    topPages: [
      { label: '/ko', value: 18 },
      { label: '/ko/posts', value: 9 },
    ],
    topSources: [{ label: 'google', value: 10 }],
  };

  const search = {
    latestDate: '2026-11-14',
    latest: { clicks: 0, impressions: 0, ctr: 0, position: null },
    last7Range: { start: '2026-11-08', end: '2026-11-14' },
    last7: { clicks: 1, impressions: 3, ctr: 1 / 3, position: 12.34 },
    prev7: { clicks: 0, impressions: 0, ctr: 0, position: null },
    topQueries: [{ label: 'comdraft', value: 3 }],
  };

  const service = {
    newUsers: 2,
    generations: 5,
    completedGenerations: 4,
    failedGenerations: 1,
    publishedPosts: 1,
  };

  it('제목은 ASCII 로 날짜를 담는다 (SNS 이메일 제목 제약)', () => {
    const { subject } = buildDailyReport({ period, traffic, search, service });

    expect(subject).toBe('[comdraft] Daily report 2026-11-17');
    expect(/^[\x20-\x7e]+$/.test(subject)).toBe(true);
  });

  it('방문·검색·서비스 현황을 전일·지난 7일과 비교해 적는다', () => {
    const { message } = buildDailyReport({ period, traffic, search, service });

    expect(message).toContain('[comdraft] 일일 현황 · 2026-11-17 (화)');
    expect(message).toContain('■ 방문 (GA4 · 어제 11/16)');
    expect(message).toContain('활성 사용자 22 (전일 +1)');
    expect(message).toContain('세션 22 (전일 -3)');
    expect(message).toContain('페이지뷰 37 (전일 ±0)');
    expect(message).toContain('최근 7일(11/10~11/16): 사용자 115 (+15%)');
    expect(message).toContain('인기 페이지(7일): /ko 18 · /ko/posts 9');
    expect(message).toContain('유입 경로(7일): google 10');

    expect(message).toContain(
      '■ 검색 (Search Console · 확정된 최근 날짜 11/14)',
    );
    expect(message).toContain('클릭 0 · 노출 0 · CTR 0.0% · 평균 순위 -');
    expect(message).toContain(
      '최근 7일(11/08~11/14): 클릭 1 (신규) · 노출 3 (신규) · CTR 33.3% · 평균 순위 12.3',
    );
    // 클릭이 적은 초기에는 노출 수로 순위를 보여 줌
    expect(message).toContain('인기 검색어(7일, 노출): comdraft 3');

    expect(message).toContain('■ 서비스 (운영 DB · 어제 11/16)');
    expect(message).toContain(
      '신규 가입 2 · AI 작성 요청 5 (완료 4 · 실패 1) · 새 게시글 1',
    );
  });

  it('조회에 실패한 항목은 조회 실패로 적고 나머지는 그대로 보낸다', () => {
    const { message } = buildDailyReport({
      period,
      traffic: null,
      search,
      service: null,
    });

    expect(message).toContain('■ 방문 (GA4)\n조회 실패');
    expect(message).toContain('■ 서비스 (운영 DB)\n조회 실패');
    expect(message).toContain(
      '■ 검색 (Search Console · 확정된 최근 날짜 11/14)',
    );
  });

  it('순위 목록이 비면 아직 없음, 검색 데이터가 없으면 안내 문구', () => {
    const { message } = buildDailyReport({
      period,
      traffic: { ...traffic, topPages: [], topSources: [] },
      search: { ...search, latestDate: null, topQueries: [] },
      service,
    });

    expect(message).toContain('인기 페이지(7일): 아직 없음');
    expect(message).toContain(
      '■ 검색 (Search Console)\n아직 검색 데이터가 없습니다',
    );
  });
});
