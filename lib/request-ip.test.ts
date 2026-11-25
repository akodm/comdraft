import { describe, expect, it } from 'vitest';
import { getClientIp } from '@/lib/request-ip';

const headersOf = (values: Record<string, string>) => new Headers(values);

describe('getClientIp', () => {
  it('x-real-ip 를 x-forwarded-for 보다 먼저 씀', () => {
    expect(
      getClientIp(
        headersOf({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' }),
      ),
    ).toBe('1.1.1.1');
  });

  it('x-real-ip 가 없으면 x-forwarded-for 의 첫 값', () => {
    expect(
      getClientIp(headersOf({ 'x-forwarded-for': ' 2.2.2.2 , 3.3.3.3' })),
    ).toBe('2.2.2.2');
  });

  it('둘 다 없으면 unknown', () => {
    expect(getClientIp(headersOf({}))).toBe('unknown');
  });
});
