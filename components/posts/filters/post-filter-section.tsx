import LanguageFilter from '@/components/posts/filters/language-filter';
import type { PostListFilters } from '@/lib/posts/post-list';

interface PostFilterSectionProps {
  filters: PostListFilters;
}

/**
 * 게시글 목록 필터 섹션 (PC 오른쪽 패널과 모바일 사이드바가 같은 내용을 씀)
 * - 필터 그룹(PostFilterGroup)을 위에서 아래로 쌓음, 검색·태그 등은 여기에 그룹을 추가
 */
const PostFilterSection = ({ filters }: PostFilterSectionProps) => {
  return (
    <div className="flex flex-col gap-8">
      <LanguageFilter filters={filters} />
    </div>
  );
};

export default PostFilterSection;
