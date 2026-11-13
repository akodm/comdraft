import { describe, expect, it } from 'vitest';
import { getGithubProfileUrl } from '@/lib/posts/github-profile';

describe('getGithubProfileUrl', () => {
  it('GitHub 아이디 형식이면 프로필 주소', () => {
    expect(getGithubProfileUrl('akodm')).toBe('https://github.com/akodm');
    expect(getGithubProfileUrl('a-b1')).toBe('https://github.com/a-b1');
  });

  it('형식 밖이면 null', () => {
    for (const bad of [null, '', '-abc', 'a b', 'a/b', 'x'.repeat(40)]) {
      expect(getGithubProfileUrl(bad)).toBeNull();
    }
  });
});
