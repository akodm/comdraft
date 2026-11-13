'use client';

import { useEffect } from 'react';
import { recordPostView } from '@/lib/actions/post-views';

/**
 * 게시글 상세가 브라우저에서 열린 뒤 조회를 한 번 기록 (화면에는 아무것도 그리지 않음)
 * - JS 를 실행하지 않는 봇이나 링크 미리 불러오기는 기록되지 않음
 * - 개발 모드의 이중 실행은 서버의 30일 규칙이 한 번으로 막음
 */
const PostViewRecorder = ({ postId }: { postId: string }) => {
  useEffect(() => {
    void recordPostView(postId).catch(() => {});
  }, [postId]);

  return null;
};

export default PostViewRecorder;
