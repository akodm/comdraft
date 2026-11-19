import { describe, expect, it } from 'vitest';
import {
  parseAdditionalUserInputFromProviderProfile,
  parseUserInput,
} from 'better-auth/db';
import {
  changesProviderOnlyField,
  USER_ADDITIONAL_FIELDS,
} from '@/lib/auth/user-fields';

const options = { user: { additionalFields: USER_ADDITIONAL_FIELDS } };

describe('USER_ADDITIONAL_FIELDS', () => {
  it('가입할 때 GitHub 프로필의 githubLogin 을 저장한다', () => {
    expect(
      parseAdditionalUserInputFromProviderProfile(
        options,
        { githubLogin: 'akodm' },
        'create',
      ),
    ).toMatchObject({ githubLogin: 'akodm' });
  });

  it('등급과 온보딩 시각은 클라이언트 요청으로 바꿀 수 없다', () => {
    expect(() => parseUserInput(options, { role: 'pro' }, 'update')).toThrow();
    expect(() =>
      parseUserInput(options, { onboardedAt: new Date() }, 'update'),
    ).toThrow();
  });

  it('이용 제한 시각은 세션 user 에 들어가고 클라이언트 요청으로 바꿀 수 없다', () => {
    expect(USER_ADDITIONAL_FIELDS.bannedAt).toMatchObject({
      type: 'date',
      required: false,
      input: false,
    });
    expect(() =>
      parseUserInput(options, { bannedAt: new Date() }, 'update'),
    ).toThrow();
    expect(
      parseAdditionalUserInputFromProviderProfile(
        options,
        { bannedAt: new Date() },
        'create',
      ),
    ).not.toHaveProperty('bannedAt');
  });
});

describe('changesProviderOnlyField', () => {
  it('githubLogin 을 바꾸려는 수정 요청만 막는다', () => {
    expect(changesProviderOnlyField({ githubLogin: 'other' })).toBe(true);
    expect(changesProviderOnlyField({ name: '이름' })).toBe(false);
  });
});
