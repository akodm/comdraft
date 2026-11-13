import 'server-only';
import { ImageResponse } from 'next/og';
import type { ReactNode } from 'react';
import { loadOgFonts } from '@/lib/seo/og-font';
import { truncateOgText } from '@/lib/seo/og-text';

// 오픈그래프 이미지 크기 (주요 SNS 권장 1.91:1)
export const OG_IMAGE_SIZE = { width: 1200, height: 630 };

// css/globals.css 의 색 토큰과 같은 값 (이미지 생성기는 CSS 변수를 읽지 못함)
const COLOR = {
  brand: '#245bff',
  brandSoft: '#edf2ff',
  ink: '#111214',
  inkMuted: '#535961',
  inkFaint: '#747b84',
  line: '#dde0e4',
};

const SANS = 'Noto Sans KR';
const MONO = 'IBM Plex Mono';
const DOMAIN = 'comdraft.dev';
const TITLE_MAX = 70;
const TAG_MAX = 5;

// 로고 (브랜드 기호 + 서비스명, components/main/brand-logo.tsx 와 같은 모양)
const Logo = ({ size }: { size: number }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3 }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        backgroundColor: COLOR.brand,
        color: 'white',
        fontFamily: MONO,
        fontSize: size * 0.6,
      }}
    >
      {'>_'}
    </div>
    <div
      style={{
        fontFamily: MONO,
        fontSize: size * 0.8,
        color: COLOR.ink,
        letterSpacing: -1,
      }}
    >
      comdraft
    </div>
  </div>
);

// 공통 틀: 흰 바탕, 위 로고, 가운데 내용, 아래 주소와 브랜드 띠
const Frame = ({
  children,
  footer,
}: {
  children: ReactNode;
  footer: ReactNode;
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: 'white',
      fontFamily: SANS,
      borderBottom: `14px solid ${COLOR.brand}`,
      padding: '64px 80px 52px',
    }}
  >
    <Logo size={52} />
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        flexGrow: 1,
      }}
    >
      {children}
    </div>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 28,
        color: COLOR.inkFaint,
      }}
    >
      {footer}
      <div style={{ fontFamily: MONO }}>{DOMAIN}</div>
    </div>
  </div>
);

// 게시글 이미지는 요청마다 만드는 경로라 CDN 과 브라우저가 1시간 동안 재사용하도록 (다시 게시 반영은 길어야 1시간)
const POST_IMAGE_CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600';

const render = async (
  element: ReactNode,
  text: string,
  headers?: Record<string, string>,
) =>
  new ImageResponse(element as React.ReactElement, {
    ...OG_IMAGE_SIZE,
    fonts: await loadOgFonts(`${text}comdraft>_${DOMAIN}`),
    headers,
  });

/** 사이트 기본 오픈그래프 이미지 (언어별 소개 문구) */
export const renderSiteOgImage = ({
  tagline,
  features,
}: {
  tagline: string;
  features: string;
}) =>
  render(
    <Frame footer={<div />}>
      <div
        style={{
          fontSize: 68,
          lineHeight: 1.25,
          color: COLOR.ink,
          letterSpacing: -2,
        }}
      >
        {tagline}
      </div>
      <div style={{ marginTop: 28, fontSize: 32, color: COLOR.inkMuted }}>
        {features}
      </div>
    </Frame>,
    `${tagline}${features}`,
  );

/** 게시글 오픈그래프 이미지 (제목, 기술 태그, 작성자) */
export const renderPostOgImage = ({
  title,
  tags,
  authorName,
}: {
  title: string;
  tags: string[];
  authorName: string;
}) => {
  const shownTitle = truncateOgText(title, TITLE_MAX);
  const shownTags = tags.slice(0, TAG_MAX);

  return render(
    <Frame footer={<div style={{ color: COLOR.inkMuted }}>{authorName}</div>}>
      <div
        style={{
          fontSize: 60,
          lineHeight: 1.3,
          color: COLOR.ink,
          letterSpacing: -1.5,
        }}
      >
        {shownTitle}
      </div>
      {shownTags.length > 0 && (
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 32 }}
        >
          {shownTags.map((tag) => (
            <div
              key={tag}
              style={{
                display: 'flex',
                padding: '8px 20px',
                borderRadius: 999,
                backgroundColor: COLOR.brandSoft,
                color: COLOR.brand,
                fontSize: 26,
                fontFamily: MONO,
              }}
            >
              {`#${tag}`}
            </div>
          ))}
        </div>
      )}
    </Frame>,
    `${shownTitle}${shownTags.join('')}#${authorName}`,
    { 'Cache-Control': POST_IMAGE_CACHE_CONTROL },
  );
};
