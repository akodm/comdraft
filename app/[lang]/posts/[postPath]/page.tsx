import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Trans } from '@lingui/react/macro';
import PageLayout from '@/components/layout/page-layout';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import PostContent from '@/components/posts/post-content';
import PostViewRecorder from '@/components/posts/post-view-recorder';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/dashboard/format';
import { localizedPermanentRedirect } from '@/lib/i18n/request';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { isGithubAvatar } from '@/lib/posts/avatar';
import { getGithubProfileUrl } from '@/lib/posts/github-profile';
import { buildPostMetadata, getSiteOrigin } from '@/lib/posts/metadata';
import { buildBlogPostingJsonLd, serializeJsonLd } from '@/lib/seo/json-ld';
import { localizePath } from '@/lib/i18n/config';
import { removeLeadingTitle } from '@/lib/posts/post-content';
import { getEncodedPostPath, parsePostPath } from '@/lib/posts/post-path';
import { getPublishedPost } from '@/lib/posts/queries';

interface PostPageProps {
  params: Promise<{ postPath: string }>;
}

// 주소 세그먼트를 디코드해 slug 와 ID 로 나눔 (형식이 틀리면 null)
const parseSegment = (segment: string) => {
  try {
    return parsePostPath(decodeURIComponent(segment));
  } catch {
    // 잘못된 퍼센트 인코딩
    return null;
  }
};

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const parsed = parseSegment((await params).postPath);
  const post = parsed ? await getPublishedPost(parsed.id) : null;
  const origin = getSiteOrigin();

  if (!post || !origin) return {};

  return buildPostMetadata(post, origin);
}

export default async function PostPage({ params }: PostPageProps) {
  await initLingui();
  const locale = await getLocale();
  const parsed = parseSegment((await params).postPath);

  if (!parsed) notFound();

  const post = await getPublishedPost(parsed.id);

  if (!post) notFound();

  // slug 는 제목이 바뀌면 달라지므로 예전 주소는 현재 주소로 영구 이동
  if (parsed.slug !== post.slug) {
    await localizedPermanentRedirect(getEncodedPostPath(post));
  }

  const session = await getSession();
  const isRepublished = post.updatedAt.getTime() > post.publishedAt.getTime();
  // 작성자 GitHub 아이디가 있으면 아바타·이름을 GitHub 프로필 새 탭 링크로
  const authorProfileUrl = getGithubProfileUrl(post.author.githubLogin);
  // 검색 결과의 글 정보 (schema.org BlogPosting, 대표 주소는 게시할 때의 언어 기준)
  const origin = getSiteOrigin();
  const canonicalUrl =
    origin && `${origin}${localizePath(post.locale, getEncodedPostPath(post))}`;
  const jsonLd =
    canonicalUrl &&
    buildBlogPostingJsonLd({
      url: canonicalUrl,
      title: post.title,
      description: post.excerpt,
      image: `${canonicalUrl}/opengraph-image`,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      authorName: post.author.name,
      authorUrl: authorProfileUrl,
      tags: post.tags,
      locale: post.locale,
    });
  const author = (
    <>
      {isGithubAvatar(post.author.image) && (
        <Image
          src={post.author.image}
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-full"
        />
      )}
      <span className="font-medium text-ink group-hover:underline">
        {post.author.name}
      </span>
    </>
  );

  return (
    <PageLayout
      header={<MainHeader isSignedIn={Boolean(session)} />}
      footer={<MainFooter />}
    >
      <article className="mx-auto w-full max-w-3xl px-5 pt-8 pb-12 pc:px-0 pc:pt-14 pc:pb-20">
        <header className="mb-8 flex flex-col gap-4 pc:mb-12">
          <h1 className="text-[23px] leading-[1.5] font-bold tracking-[-0.8px] wrap-break-word text-ink pc:text-[32px] pc:tracking-[-1px]">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted pc:text-[14px]">
            {authorProfileUrl ? (
              <a
                href={authorProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-x-3"
              >
                {author}
              </a>
            ) : (
              author
            )}
            <span aria-hidden="true">·</span>
            <time dateTime={post.publishedAt.toISOString()}>
              {formatDate(post.publishedAt, locale)}
            </time>
            {isRepublished && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  <Trans>수정</Trans>{' '}
                  <time dateTime={post.updatedAt.toISOString()}>
                    {formatDate(post.updatedAt, locale)}
                  </time>
                </span>
              </>
            )}
          </div>
        </header>
        {/* 머리에 제목을 보여 주므로 본문 맨 앞의 같은 제목은 빼고 그림 */}
        <PostContent content={removeLeadingTitle(post.content, post.title)} />
        <PostViewRecorder postId={post.id} />
        {jsonLd && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
          />
        )}
      </article>
    </PageLayout>
  );
}
