// GitHub 아이디 형식: 영문·숫자로 시작, 영문·숫자·- 로 최대 39자
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

// 작성자 GitHub 프로필 주소 (아이디가 없거나 형식 밖이면 링크를 만들지 않음)
export const getGithubProfileUrl = (login: string | null): string | null => {
  return login && GITHUB_LOGIN.test(login)
    ? `https://github.com/${login}`
    : null;
};
