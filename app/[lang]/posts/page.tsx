import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import PageLayout from '@/components/layout/page-layout';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import PostListItem from '@/components/posts/post-list-item';
import PostPagination from '@/components/posts/post-pagination';
import { getSession } from '@/lib/auth/session';
import { initLingui } from '@/lib/i18n/server';
import { parsePageParam } from '@/lib/posts/post-list';
import { getPostListPage } from '@/lib/posts/queries';

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();

  return { title: i18n._(msg`게시글`) };
}

interface PostsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * 게시글 목록 (공개 글 최신순, 30개씩 번호 페이지네이션)
 * - 화면에는 목록만 (제목·설명 문구 없이, 접근성용 숨김 제목만)
 * - page 가 양의 정수가 아니면 1쪽, 마지막 쪽보다 크면 404
 */
export default async function PostsPage({ searchParams }: PostsPageProps) {
  await initLingui();
  const page = parsePageParam((await searchParams).page);
  const [session, { posts, totalPages }] = await Promise.all([
    getSession(),
    getPostListPage(page),
  ]);

  if (totalPages > 0 && page > totalPages) {
    notFound();
  }

  return (
    <PageLayout
      header={<MainHeader isSignedIn={Boolean(session)} />}
      footer={<MainFooter />}
      className="flex flex-col"
    >
      <section className="mx-auto flex w-full max-w-170 flex-1 flex-col px-5 pt-3 pb-12 pc:px-0 pc:pt-8 pc:pb-20">
        <h1 className="sr-only">
          <Trans>게시글</Trans>
        </h1>
        {posts.length > 0 ? (
          <div className="flex flex-col gap-8 pc:gap-12">
            <ul className="flex flex-col divide-y divide-line">
              {posts.map((post) => (
                <li key={post.id}>
                  <PostListItem post={post} />
                </li>
              ))}
            </ul>
            <PostPagination currentPage={page} totalPages={totalPages} />
          </div>
        ) : (
          <p className="my-auto text-center text-[14px] leading-[1.7] text-ink-muted">
            <Trans>아직 게시된 글이 없습니다</Trans>
          </p>
        )}
      </section>
    </PageLayout>
  );
}
