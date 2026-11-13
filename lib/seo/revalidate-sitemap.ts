import 'server-only';
import { revalidatePath } from 'next/cache';

/**
 * 캐시해 둔 사이트맵(app/sitemap.ts)을 다음 요청 때 다시 만들도록 표시
 * - 공개 글 목록이 바뀌는 곳(게시·다시 게시·게시 취소, 초안 삭제, 저장소 연결 해제)과 주간 크론이 부름
 * - 다시 게시하면 게시글 수정 시각이 바뀌어 사이트맵의 lastModified 로 반영됨
 */
export const revalidateSitemap = () => {
  revalidatePath('/sitemap.xml');
};
