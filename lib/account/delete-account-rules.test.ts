import { describe, expect, it } from 'vitest';
import {
  buildGithubGrantRevokeRequest,
  DELETE_CONFIRM_DELAY_MS,
  isSessionCookieName,
} from '@/lib/account/delete-account-rules';

describe('isSessionCookieName', () => {
  it('Better Auth 세션 쿠키(접두사 comdraft, 보안 접두사 포함)만 고른다', () => {
    expect(isSessionCookieName('comdraft.session_token')).toBe(true);
    expect(isSessionCookieName('__Secure-comdraft.session_token')).toBe(true);
    expect(isSessionCookieName('comdraft.session_data')).toBe(true);
    expect(isSessionCookieName('comdraft.dont_remember')).toBe(true);
    expect(isSessionCookieName('comdraft-locale')).toBe(false);
    expect(isSessionCookieName('comdraft-viewer')).toBe(false);
    expect(isSessionCookieName('other.session_token')).toBe(false);
  });
});

describe('buildGithubGrantRevokeRequest', () => {
  it('앱 Client ID·Secret 의 Basic 인증으로 사용자 권한(grant) 삭제를 요청', () => {
    const { url, init } = buildGithubGrantRevokeRequest('cid', 'secret', 'tok');

    expect(url).toBe('https://api.github.com/applications/cid/grant');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('cid:secret').toString('base64')}`,
      Accept: 'application/vnd.github+json',
    });
    expect(JSON.parse(init.body as string)).toEqual({ access_token: 'tok' });
  });
});

describe('DELETE_CONFIRM_DELAY_MS', () => {
  it('탈퇴 버튼은 모달을 연 뒤 2초 뒤에 누를 수 있다', () => {
    expect(DELETE_CONFIRM_DELAY_MS).toBe(2000);
  });
});
