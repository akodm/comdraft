import type { Metadata } from 'next';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import PageLayout from '@/components/layout/page-layout';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import PostFeed from '@/components/posts/post-feed';
import { getSession } from '@/lib/auth/session';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { getPostFeedPage } from '@/lib/posts/queries';

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();

  return { title: i18n._(msg`게시글`) };
}

export default async function PostsPage() {
  await initLingui();
  const locale = await getLocale();
  const [session, firstPage] = await Promise.all([
    getSession(),
    getPostFeedPage(),
  ]);

  return (
    <PageLayout
      header={<MainHeader isSignedIn={Boolean(session)} />}
      footer={<MainFooter />}
      className="flex flex-col"
    >
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pt-8 pb-12 pc:px-0 pc:pt-14 pc:pb-20">
        <h1 className="sr-only">
          <Trans>게시글</Trans>
        </h1>
        {/* 첫 페이지가 바뀌면(새로고침·새 글) 이어 붙인 목록을 버리고 새로 시작 */}
        {firstPage.posts.length > 0 ? (
          <PostFeed
            key={`${locale}:${firstPage.posts[0]?.id ?? ''}:${firstPage.nextCursor ?? ''}`}
            initialPage={firstPage}
            locale={locale}
          />
        ) : (
          <p className="my-auto text-center text-[14px] leading-[1.7] text-ink-muted">
            <Trans>아직 게시된 글이 없습니다</Trans>
          </p>
        )}
      </section>
    </PageLayout>
  );
}
