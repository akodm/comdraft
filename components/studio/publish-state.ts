import type { DraftStatus, PostVisibility } from '@/lib/db/schema';

// 초안의 게시 상태 (게시글이 있으면 post 가 있음)
export interface DraftPublishState {
  status: DraftStatus;
  post: { id: string; slug: string; visibility: PostVisibility } | null;
}

export interface PublishActions {
  primary: 'publish' | 'republish';
  canView: boolean;
  canUnpublish: boolean;
}

/** 게시 상태에 따라 편집기 상단에 보일 동작 */
export const getPublishActions = ({
  post,
}: DraftPublishState): PublishActions => ({
  primary: post ? 'republish' : 'publish',
  canView: post !== null,
  canUnpublish: post !== null,
});

/**
 * 서버에서 받은 상태 위에 화면에서 바뀐 값을 덮어씀
 * - 게시 상태 덮어쓰기(게시, 게시 취소) 위에 더 나중에 바뀐 자동 저장 상태가 우선
 */
export const resolvePublishState = (
  base: DraftPublishState,
  publishOverride: DraftPublishState | undefined,
  statusOverride: DraftStatus | undefined,
): DraftPublishState => {
  const state = publishOverride ?? base;

  return { ...state, status: statusOverride ?? state.status };
};
