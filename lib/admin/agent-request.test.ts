import { describe, expect, it } from 'vitest';
import { checkAgentRequest, maskAdminKey } from '@/lib/admin/agent-request';

const URL_ = 'https://comdraft.dev/api/agent';

const request = (headers: Record<string, string>) =>
  new Request(URL_, { method: 'POST', headers, body: '{}' });

const JSON_ = { 'content-type': 'application/json' };

describe('checkAgentRequest', () => {
  it('승인 서명 비밀이 없으면 503 (승인 검사가 꺼진 채로 돌지 않게)', () => {
    expect(
      checkAgentRequest(
        request({ ...JSON_, 'sec-fetch-site': 'same-origin' }),
        {
          approvalSecret: undefined,
        },
      ),
    ).toBe('missing_secret');
  });

  it('같은 출처의 JSON 요청은 통과', () => {
    expect(
      checkAgentRequest(
        request({ ...JSON_, 'sec-fetch-site': 'same-origin' }),
        {
          approvalSecret: 's',
        },
      ),
    ).toBe('ok');
    expect(
      checkAgentRequest(request({ ...JSON_, origin: 'https://comdraft.dev' }), {
        approvalSecret: 's',
      }),
    ).toBe('ok');
  });

  it('다른 출처·같은 사이트 다른 하위 도메인·출처 정보 없음은 거절', () => {
    expect(
      checkAgentRequest(request({ ...JSON_, 'sec-fetch-site': 'same-site' }), {
        approvalSecret: 's',
      }),
    ).toBe('cross_origin');
    expect(
      checkAgentRequest(request({ ...JSON_, origin: 'https://evil.example' }), {
        approvalSecret: 's',
      }),
    ).toBe('cross_origin');
    expect(
      checkAgentRequest(
        request({ ...JSON_, origin: 'https://www.comdraft.dev' }),
        {
          approvalSecret: 's',
        },
      ),
    ).toBe('cross_origin');
    expect(checkAgentRequest(request(JSON_), { approvalSecret: 's' })).toBe(
      'cross_origin',
    );
  });

  it('JSON 이 아니면 거절 (text/plain 같은 단순 요청 차단)', () => {
    expect(
      checkAgentRequest(
        request({
          'content-type': 'text/plain',
          'sec-fetch-site': 'same-origin',
        }),
        { approvalSecret: 's' },
      ),
    ).toBe('not_json');
  });
});

describe('maskAdminKey', () => {
  const KEY = 'k3y_abcdefghijklmn';

  it('주소의 어드민 키를 가린다', () => {
    expect(maskAdminKey(`/ko/admin/${KEY}/users`, KEY)).toBe(
      '/ko/admin/:key/users',
    );
  });

  it('키가 없거나 주소가 없으면 그대로', () => {
    expect(maskAdminKey('/ko/admin/x/users', undefined)).toBe(
      '/ko/admin/x/users',
    );
    expect(maskAdminKey(undefined, KEY)).toBeUndefined();
  });
});
