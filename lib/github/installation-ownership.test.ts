import { describe, expect, it } from 'vitest';
import { isCollaborationInstallation } from '@/lib/github/installation-ownership';

describe('isCollaborationInstallation', () => {
  it('본인 개인 계정 설치는 협업 설치가 아님', () => {
    expect(isCollaborationInstallation({ id: 42, type: 'User' }, '42')).toBe(
      false,
    );
  });

  it('다른 사람 개인 계정 설치는 협업 설치', () => {
    expect(isCollaborationInstallation({ id: 7, type: 'User' }, '42')).toBe(
      true,
    );
  });

  it('조직 설치는 협업 설치가 아님', () => {
    expect(
      isCollaborationInstallation({ id: 7, type: 'Organization' }, '42'),
    ).toBe(false);
  });

  it('계정 정보가 없으면 협업 설치로 보지 않음', () => {
    expect(isCollaborationInstallation(null, '42')).toBe(false);
  });

  it('GitHub 계정 id 를 모르면 개인 계정 설치는 협업 설치로 봄', () => {
    expect(isCollaborationInstallation({ id: 42, type: 'User' }, null)).toBe(
      true,
    );
  });
});
