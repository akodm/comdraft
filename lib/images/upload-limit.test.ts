import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// server-only 는 서버 컴포넌트 밖에서 import 하면 던지므로 테스트에서는 비운다
vi.mock('server-only', () => ({}));

// insert … on conflict do update … returning 만 흉내 내는 가짜 DB (올린 뒤의 수를 돌려줌)
const captured: {
  values?: { key: string; count: number };
  set?: { count: SQL };
} = {};
const state = { count: 0 };
const builder = {
  insert: () => builder,
  values: (values: { key: string; count: number }) => {
    captured.values = values;
    return builder;
  },
  onConflictDoUpdate: ({ set }: { set: { count: SQL } }) => {
    captured.set = set;
    return builder;
  },
  returning: async () => [{ count: state.count }],
};
vi.mock('@/lib/db', () => ({ db: builder }));

const { consumeImageUploadAttempt, IMAGE_UPLOAD_HOURLY_LIMIT } =
  await import('@/lib/images/upload-limit');

describe('consumeImageUploadAttempt', () => {
  beforeEach(() => {
    captured.values = undefined;
    captured.set = undefined;
  });

  it('주소 발급과 마무리는 시간당 30회까지', () => {
    expect(IMAGE_UPLOAD_HOURLY_LIMIT).toBe(30);
  });

  it.each([
    ['upload-url', 'image-upload-url:u1'],
    ['finalize', 'image-finalize:u1'],
  ] as const)('%s 는 %s 키로 셈', async (kind, key) => {
    state.count = 1;

    await consumeImageUploadAttempt(kind, 'u1');

    expect(captured.values).toMatchObject({ key, count: 1 });
  });

  it('먼저 1 올리고, 1시간이 지났으면 1 부터 다시 셈 (한 문장)', async () => {
    state.count = 1;

    await consumeImageUploadAttempt('upload-url', 'u1');

    const { sql, params } = new PgDialect().sqlToQuery(captured.set!.count);
    expect(sql).toContain('case when');
    expect(sql).toContain('+ 1');
    expect(params).toContain(60 * 60 * 1000);
  });

  it('올린 뒤의 수가 한도 이하면 허용, 넘으면 거절', async () => {
    state.count = IMAGE_UPLOAD_HOURLY_LIMIT;
    await expect(consumeImageUploadAttempt('finalize', 'u1')).resolves.toBe(
      true,
    );

    state.count = IMAGE_UPLOAD_HOURLY_LIMIT + 1;
    await expect(consumeImageUploadAttempt('finalize', 'u1')).resolves.toBe(
      false,
    );
  });
});
