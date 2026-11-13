/** 오픈그래프 이미지 글자를 코드 포인트 기준으로 자르고 넘치면 말줄임표 (이모지가 반으로 잘리지 않음) */
export const truncateOgText = (text: string, max: number): string => {
  const chars = Array.from(text);

  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
};
