// 게시글 짧은 ID 생성과 검증. 서버/클라이언트 양쪽에서 쓰므로 server-only 나 Lingui 를 import 하지 않는다.

export const POST_ID_LENGTH = 10;

const POST_ID_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// 62 * 4 = 248. 이 값 미만의 바이트만 써야 모듈로 편향이 생기지 않는다.
const UNBIASED_BYTE_LIMIT = 248;

const POST_ID_PATTERN = new RegExp(`^[0-9A-Za-z]{${POST_ID_LENGTH}}$`);

/** 10자 영숫자 게시글 ID 를 만든다. */
export function createPostId(): string {
  let id = '';

  while (id.length < POST_ID_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(POST_ID_LENGTH));

    for (const byte of bytes) {
      if (id.length === POST_ID_LENGTH) break;
      if (byte < UNBIASED_BYTE_LIMIT) {
        id += POST_ID_ALPHABET[byte % POST_ID_ALPHABET.length];
      }
    }
  }

  return id;
}

/** 게시글 ID 형식(10자 영숫자)인지 확인한다. */
export function isPostId(value: string): boolean {
  return POST_ID_PATTERN.test(value);
}
