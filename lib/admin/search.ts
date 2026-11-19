// LIKE 의 와일드카드(%, _, \)를 글자 그대로 찾도록 이스케이프
export const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);
