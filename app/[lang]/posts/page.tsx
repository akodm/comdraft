import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Trans } from '@lingui/react/macro';
import PageLayout from '@/components/layout/page-layout';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import MobileFilterSidebar from '@/components/posts/filters/mobile-filter-sidebar';
import PostFilterSection from '@/components/posts/filters/post-filter-section';
import PostFilterTitle from '@/components/posts/filters/post-filter-title';
import PostListItem from '@/components/posts/post-list-item';
import PostPagination from '@/components/posts/post-pagination';
import { getSession } from '@/lib/auth/session';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { getSiteOrigin } from '@/lib/posts/metadata';
import { POSTS_DESCRIPTION, POSTS_TITLE } from '@/lib/seo/copy';
import { buildWebsiteOpenGraph } from '@/lib/seo/open-graph';
import { buildLocalizedAlternates } from '@/lib/seo/urls';
import {
  hasActivePostListFilters,
  parsePageParam,
  parsePostListFilters,
} from '@/lib/posts/post-list';
import { getPostListPage } from '@/lib/posts/queries';

interface PostsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * 게시글 목록 메타데이터: 언어별 대표 주소와 hreflang (2쪽부터는 `?page=N` 이 대표 주소)
 * - 필터를 건 목록은 검색에 노출하지 않고(링크는 따라감) 대표 주소를 필터 없는 목록 첫 쪽으로
 */
export async function generateMetadata({
  searchParams,
}: PostsPageProps): Promise<Metadata> {
  const i18n = await initLingui();
  const locale = await getLocale();
  const params = await searchParams;
  const isFiltered = hasActivePostListFilters(parsePostListFilters(params));
  const page = isFiltered ? 1 : parsePageParam(params.page);
  const origin = getSiteOrigin();
  const title = i18n._(POSTS_TITLE);
  const description = i18n._(POSTS_DESCRIPTION);
  const alternates = origin
    ? buildLocalizedAlternates(
        origin,
        '/posts',
        locale,
        page > 1 ? `?page=${page}` : '',
      )
    : undefined;

  return {
    title,
    description,
    alternates,
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: buildWebsiteOpenGraph({
      locale,
      title,
      description,
      url: alternates?.canonical,
    }),
    twitter: { card: 'summary_large_image', title, description },
  };
}

/**
 * 게시글 목록 (공개 글 최신순, 30개씩 번호 페이지네이션)
 * - 화면에는 목록만 (제목·설명 문구 없이, 접근성용 숨김 제목만)
 * - page 가 양의 정수가 아니면 1쪽, 마지막 쪽보다 크면 404
 * - 필터(언어)는 주소의 검색 파라미터로, 화면 언어와 별개 (PC 오른쪽 패널, 모바일 사이드바)
 */
export default async function PostsPage({ searchParams }: PostsPageProps) {
  await initLingui();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const filters = parsePostListFilters(params);
  const isFiltered = hasActivePostListFilters(filters);
  const [session, { posts, totalPages }] = await Promise.all([
    getSession(),
    getPostListPage(page, filters),
  ]);

  if (totalPages > 0 && page > totalPages) {
    notFound();
  }

  const filterSection = <PostFilterSection filters={filters} />;

  return (
    <PageLayout
      header={<MainHeader isSignedIn={Boolean(session)} />}
      footer={<MainFooter />}
      className="flex flex-col"
    >
      {/* PC: 가운데 목록 폭은 그대로 두고 오른쪽 여백 칸에 필터 패널 */}
      <div className="flex w-full flex-1 flex-col px-5 pt-3 pb-12 pc:grid pc:grid-cols-[1fr_minmax(0,680px)_1fr] pc:gap-x-12 pc:pt-8 pc:pb-20">
        <section className="mx-auto flex w-full max-w-170 flex-1 flex-col pc:col-start-2">
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
              <PostPagination
                currentPage={page}
                totalPages={totalPages}
                filters={filters}
              />
            </div>
          ) : (
            <p className="my-auto text-center text-[14px] leading-[1.7] text-ink-muted">
              {isFiltered ? (
                <Trans>선택한 언어로 게시된 글이 없습니다</Trans>
              ) : (
                <Trans>아직 게시된 글이 없습니다</Trans>
              )}
            </p>
          )}
        </section>
        <aside className="hidden pc:col-start-3 pc:block">
          <div className="sticky top-8 flex w-56 flex-col gap-6 border border-line bg-white p-5">
            <PostFilterTitle />
            {filterSection}
          </div>
        </aside>
        <MobileFilterSidebar hasActiveFilters={isFiltered}>
          {filterSection}
        </MobileFilterSidebar>
      </div>
    </PageLayout>
  );
}
