// next/image 에 허용된 호스트(GitHub 아바타)만 그림 (그 밖의 호스트는 렌더링 오류가 나므로 생략)
export const isGithubAvatar = (image: string | null): image is string =>
  image?.startsWith('https://avatars.githubusercontent.com/') ?? false;
