import Image from 'next/image';
import LocalizedLink from '@/components/shared/localized-link';
import { formatDate } from '@/lib/dashboard/format';
import type { Locale } from '@/lib/i18n/config';
import { isGithubAvatar } from '@/lib/posts/avatar';
import { getPostPath } from '@/lib/posts/post-path';
import type { PostFeedItem } from '@/lib/posts/queries';

interface PostCardProps {
  post: PostFeedItem;
  // 게시일 표기 언어
  locale: Locale;
}

/**
 * 전체 피드의 게시글 카드
 * - 제목, 요약, 작성자(이름과 아바타), 게시일을 보여주고 카드 전체가 상세로 연결
 */
const PostCard = ({ post, locale }: PostCardProps) => {
  const { title, excerpt, author, publishedAt } = post;

  return (
    <article className="relative flex flex-col gap-3 rounded-md border border-line bg-white px-5 py-4 pc:gap-4 pc:p-6">
      <h2 className="text-[18px] leading-[1.5] font-bold tracking-[-0.5px] wrap-anywhere text-ink pc:text-[22px]">
        {/* 카드 전체를 덮는 링크 */}
        <LocalizedLink
          href={getPostPath(post)}
          className="after:absolute after:inset-0"
        >
          {title}
        </LocalizedLink>
      </h2>
      {excerpt && (
        <p className="line-clamp-3 text-[14px] leading-[1.7] wrap-anywhere text-ink-muted">
          {excerpt}
        </p>
      )}
      <div className="flex items-center gap-2 text-[13px] text-ink-muted">
        {isGithubAvatar(author.image) && (
          <Image
            src={author.image}
            alt=""
            width={24}
            height={24}
            className="size-6 rounded-full"
          />
        )}
        <span className="font-medium text-ink">{author.name}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={publishedAt.toISOString()}>
          {formatDate(publishedAt, locale)}
        </time>
      </div>
    </article>
  );
};

export default PostCard;
