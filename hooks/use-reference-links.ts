import { useCallback, useState } from 'react';
import {
  addDraftReferenceLink,
  deleteDraftReferenceLink,
} from '@/lib/actions/reference-links';
import {
  MAX_REFERENCE_LINKS,
  parseReferenceUrl,
  type ReferenceLink,
} from '@/lib/studio/reference-link';

export type AddReferenceLinkStatus =
  | 'added'
  | 'invalid'
  | 'duplicate'
  | 'limit'
  | 'not_found'
  | 'error';

/**
 * 초안의 참고 링크 목록
 * - 저장된 초안: 추가/삭제를 바로 서버에 저장
 * - 새 초안(draftId 가 null): 화면에만 두었다가 작성 요청을 보낼 때 초안과 함께 저장
 * - 주소 형식, 중복, 최대 개수는 서버와 같은 기준으로 먼저 확인
 */
export const useReferenceLinks = (
  repositoryId: string,
  draftId: string | null,
  initialLinks: ReferenceLink[],
) => {
  const [links, setLinks] = useState(initialLinks);

  const add = useCallback(
    async (input: string): Promise<AddReferenceLinkStatus> => {
      const url = parseReferenceUrl(input);

      if (!url) {
        return 'invalid';
      }

      if (links.some((link) => link.url === url)) {
        return 'duplicate';
      }

      if (links.length >= MAX_REFERENCE_LINKS) {
        return 'limit';
      }

      if (!draftId) {
        setLinks((previous) => [...previous, { id: crypto.randomUUID(), url }]);
        return 'added';
      }

      try {
        const result = await addDraftReferenceLink(repositoryId, draftId, url);

        if (result.status === 'added') {
          setLinks((previous) => [...previous, result.link]);
        }

        return result.status;
      } catch {
        return 'error';
      }
    },
    [repositoryId, draftId, links],
  );

  // 목록에서 먼저 지우고, 서버 삭제에 실패하면 되돌림 (성공 여부 반환)
  const remove = useCallback(
    async (linkId: string) => {
      const previousLinks = links;

      setLinks((current) => current.filter(({ id }) => id !== linkId));

      if (!draftId) {
        return true;
      }

      try {
        await deleteDraftReferenceLink(repositoryId, draftId, linkId);
        return true;
      } catch {
        setLinks(previousLinks);
        return false;
      }
    },
    [repositoryId, draftId, links],
  );

  return { links, add, remove };
};
