import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Trans } from '@lingui/react/macro';
import PageLayout from '@/components/layout/page-layout';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import PostContent from '@/components/posts/post-content';
import { getSession } from '@/lib/auth/session';
import { formatDate } from '@/lib/dashboard/format';
import { localizedPermanentRedirect } from '@/lib/i18n/request';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { isGithubAvatar } from '@/lib/posts/avatar';
import { buildPostMetadata } from '@/lib/posts/metadata';
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
  const origin = process.env.BETTER_AUTH_URL;

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

  return (
    <PageLayout
      header={<MainHeader isSignedIn={Boolean(session)} />}
      footer={<MainFooter />}
    >
      <article className="mx-auto w-full max-w-3xl px-5 pt-8 pb-12 pc:px-0 pc:pt-14 pc:pb-20">
        <header className="mb-8 flex flex-col gap-4 pc:mb-12">
          <h1 className="text-[23px] leading-[1.5] font-bold tracking-[-0.8px] text-ink pc:text-[32px] pc:tracking-[-1px]">
            {post.title}
          </h1>
          <div className="flex items-center gap-3 text-[13px] text-ink-muted pc:text-[14px]">
            {isGithubAvatar(post.author.image) && (
              <Image
                src={post.author.image}
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-full"
              />
            )}
            <span className="font-medium text-ink">{post.author.name}</span>
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
      </article>
    </PageLayout>
  );
}
