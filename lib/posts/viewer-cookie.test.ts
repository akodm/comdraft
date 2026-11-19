import { describe, expect, it } from 'vitest';
import { isViewerId } from '@/lib/posts/post-view';
import {
  createViewerCookie,
  signViewerId,
  verifyViewerCookie,
} from '@/lib/posts/viewer-cookie';

const SECRET = 'test-secret-for-viewer-cookie-0123456789';
const VIEWER_ID = '0b7c2f4e-9a1d-4c3b-8e5f-6a7b8c9d0e1f';

describe('방문자 쿠키 서명', () => {
  it('서명한 값은 `<uuid>.<서명>` 이고 검증하면 uuid 를 돌려줌', () => {
    const value = signViewerId(VIEWER_ID, SECRET);

    expect(value).toMatch(new RegExp(`^${VIEWER_ID}\\.[A-Za-z0-9_-]{43}$`));
    expect(verifyViewerCookie(value, SECRET)).toBe(VIEWER_ID);
  });

  it('새 쿠키는 무작위 uuid 를 서명한 값', () => {
    const first = createViewerCookie(SECRET);
    const second = createViewerCookie(SECRET);
    const id = verifyViewerCookie(first, SECRET);

    expect(isViewerId(id ?? undefined)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('서명이나 uuid 를 바꾸면 거절', () => {
    const value = signViewerId(VIEWER_ID, SECRET);
    const [id, sig] = value.split('.');
    const flipped = `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`;
    const otherId = '1b7c2f4e-9a1d-4c3b-8e5f-6a7b8c9d0e1f';

    expect(verifyViewerCookie(`${id}.${flipped}`, SECRET)).toBeNull();
    expect(verifyViewerCookie(`${otherId}.${sig}`, SECRET)).toBeNull();
    expect(verifyViewerCookie(`${id}.${sig.slice(1)}`, SECRET)).toBeNull();
  });

  it('다른 비밀값으로 서명한 쿠키는 거절', () => {
    expect(
      verifyViewerCookie(signViewerId(VIEWER_ID, 'other-secret'), SECRET),
    ).toBeNull();
  });

  it('형식이 틀리면 거절', () => {
    for (const value of [
      undefined,
      '',
      '.',
      'abc.def',
      `${VIEWER_ID}.`,
      `.${signViewerId(VIEWER_ID, SECRET).split('.')[1]}`,
      `${signViewerId(VIEWER_ID, SECRET)}.extra`,
    ]) {
      expect(verifyViewerCookie(value, SECRET)).toBeNull();
    }
  });

  it('서명 없는 예전 uuid 쿠키는 없는 것으로 봄', () => {
    expect(verifyViewerCookie(VIEWER_ID, SECRET)).toBeNull();
  });

  it('비밀값이 없으면 서명할 수 없고 모든 쿠키를 거절', () => {
    expect(
      verifyViewerCookie(signViewerId(VIEWER_ID, SECRET), undefined),
    ).toBeNull();
    expect(verifyViewerCookie(signViewerId(VIEWER_ID, SECRET), '')).toBeNull();
    expect(() => signViewerId(VIEWER_ID, '')).toThrow();
  });
});
