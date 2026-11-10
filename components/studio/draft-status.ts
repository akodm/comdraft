import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import type { DraftStatus, PostVisibility } from '@/lib/db/schema';

export const VISIBILITY_LABELS: Record<PostVisibility, MessageDescriptor> = {
  public: msg`게시 · 공개`,
  unlisted: msg`게시 · 일부 공개`,
};

/**
 * 초안 목록/편집기 상단에 표시하는 상태 문구
 * @example getDraftStatusLabel('published', 'public') // '게시 · 공개'
 */
export const getDraftStatusLabel = (
  status: DraftStatus,
  visibility: PostVisibility | null,
): MessageDescriptor => {
  if (status === 'published') {
    return VISIBILITY_LABELS[visibility ?? 'public'];
  }

  return status === 'temporary' ? msg`임시` : msg`초안`;
};
