import 'server-only';

interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: 'normal';
}

/**
 * 오픈그래프 이미지에 쓸 Google Fonts 글꼴 (화면에 그릴 글자만 받은 TTF)
 * - 이미지 생성기는 한글 글꼴이 없어 글꼴을 직접 넘겨야 함, 저장소에 글꼴 파일을 두지 않고 필요한 글자만 받음
 * - 글자는 중복을 지우고 정렬해 보냄 (문장 그대로 보내지 않음)
 * - 받지 못하면 null: 이미지는 기본 글꼴로 만들어짐 (한글이 빠질 수 있음)
 */
const loadGoogleFont = async (
  family: string,
  weight: OgFont['weight'],
  text: string,
): Promise<ArrayBuffer | null> => {
  const glyphs = [...new Set(text)].sort().join('');
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(glyphs)}`;

  try {
    // User-Agent 없이 요청하면 woff2 대신 이미지 생성기가 읽을 수 있는 TTF 주소를 줌
    const css = await (await fetch(url)).text();
    const src = css.match(
      /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/,
    )?.[1];

    if (!src) {
      return null;
    }

    const response = await fetch(src);

    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
};

// 본문(Noto Sans KR 굵게)과 로고(IBM Plex Mono) 글꼴
export const loadOgFonts = async (text: string): Promise<OgFont[]> => {
  const [sans, mono] = await Promise.all([
    loadGoogleFont('Noto Sans KR', 700, text),
    loadGoogleFont('IBM Plex Mono', 600, text),
  ]);
  const fonts: OgFont[] = [];

  if (sans) {
    fonts.push({
      name: 'Noto Sans KR',
      data: sans,
      weight: 700,
      style: 'normal',
    });
  }

  if (mono) {
    fonts.push({
      name: 'IBM Plex Mono',
      data: mono,
      weight: 600,
      style: 'normal',
    });
  }

  return fonts;
};
