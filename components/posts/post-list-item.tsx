import Image from 'next/image';
import LocalizedLink from '@/components/shared/localized-link';
import { getPostPath } from '@/lib/posts/post-path';
import type { PostListItem as PostListItemData } from '@/lib/posts/queries';

interface PostListItemProps {
  post: PostListItemData;
}

const THUMBNAIL_CLASS = 'size-22 shrink-0 rounded pc:h-26.75 pc:w-40';

/**
 * 게시글 목록 한 줄: 왼쪽 썸네일, 오른쪽 제목과 설명 (그 밖의 정보는 보여주지 않음)
 * - 썸네일은 본문 첫 이미지, 없으면 기본 썸네일
 * - 제목 링크가 줄 전체를 덮어 어디를 눌러도 상세로 이동
 */
const PostListItem = ({ post }: PostListItemProps) => {
  const { title, excerpt, thumbnailUrl } = post;

  return (
    <article className="relative flex items-start gap-4 py-5 pc:gap-6 pc:py-7">
      {thumbnailUrl ? (
        // 게시 때 정리한 공개 저장소의 WebP 주소를 그대로 씀 (본문 이미지와 같은 파일)
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={`${THUMBNAIL_CLASS} bg-surface object-cover`}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`${THUMBNAIL_CLASS} flex items-center justify-center bg-brand-soft`}
        >
          <Image
            src="/images/posts/file-text.svg"
            alt=""
            width={28}
            height={28}
            className="size-7 pc:size-8"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pc:gap-2">
        <h2 className="line-clamp-2 text-[16px] leading-[1.45] font-bold tracking-[-0.3px] wrap-anywhere text-ink pc:text-[20px]">
          {/* 줄 전체를 덮는 링크 */}
          <LocalizedLink
            href={getPostPath(post)}
            className="after:absolute after:inset-0"
          >
            {title}
          </LocalizedLink>
        </h2>
        {excerpt && (
          <p className="line-clamp-2 text-[14px] leading-[1.65] wrap-anywhere text-ink-muted pc:line-clamp-3 pc:text-[15px]">
            {excerpt}
          </p>
        )}
      </div>
    </article>
  );
};

export default PostListItem;
