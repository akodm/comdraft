'use server';

import { and, count, eq, inArray } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { draft, draftReferenceLink } from '@/lib/db/schema';
import { isOwnedDraft } from '@/lib/studio/queries';
import {
  MAX_REFERENCE_LINKS,
  parseReferenceUrl,
  type ReferenceLink,
} from '@/lib/studio/reference-link';

export type AddReferenceLinkResult =
  | { status: 'added'; link: ReferenceLink }
  // 형식이 올바르지 않은 주소 (클라이언트 검증을 우회한 요청 포함)
  | { status: 'invalid' }
  | { status: 'duplicate' }
  | { status: 'limit' }
  | { status: 'not_found' };

/**
 * 초안에 참고 링크 추가
 * - 주소 형식만 검증하고 링크를 열어 보지 않음 (SSRF 방지)
 * - 같은 초안에 같은 주소는 한 번만, 초안당 최대 MAX_REFERENCE_LINKS 개
 */
export async function addDraftReferenceLink(
  repositoryId: string,
  draftId: string,
  input: string,
): Promise<AddReferenceLinkResult> {
  const { user } = await requireSession();
  const url = parseReferenceUrl(input);

  if (!url) {
    return { status: 'invalid' };
  }

  if (!(await isOwnedDraft(user.id, repositoryId, draftId))) {
    return { status: 'not_found' };
  }

  const [{ linkCount }] = await db
    .select({ linkCount: count() })
    .from(draftReferenceLink)
    .where(eq(draftReferenceLink.draftId, draftId));

  if (linkCount >= MAX_REFERENCE_LINKS) {
    return { status: 'limit' };
  }

  const [link] = await db
    .insert(draftReferenceLink)
    .values({ id: crypto.randomUUID(), draftId, url })
    .onConflictDoNothing({
      target: [draftReferenceLink.draftId, draftReferenceLink.url],
    })
    .returning({ id: draftReferenceLink.id, url: draftReferenceLink.url });

  return link ? { status: 'added', link } : { status: 'duplicate' };
}

export type DeleteReferenceLinkResult =
  | { status: 'deleted' }
  | { status: 'not_found' };

// 초안의 참고 링크 삭제 (본인 초안의 링크만)
export async function deleteDraftReferenceLink(
  repositoryId: string,
  draftId: string,
  linkId: string,
): Promise<DeleteReferenceLinkResult> {
  const { user } = await requireSession();
  const ownedDraft = db
    .select({ id: draft.id })
    .from(draft)
    .where(
      and(
        eq(draft.id, draftId),
        eq(draft.userId, user.id),
        eq(draft.repositoryId, repositoryId),
      ),
    );

  const deleted = await db
    .delete(draftReferenceLink)
    .where(
      and(
        eq(draftReferenceLink.id, linkId),
        inArray(draftReferenceLink.draftId, ownedDraft),
      ),
    )
    .returning({ id: draftReferenceLink.id });

  return deleted.length > 0 ? { status: 'deleted' } : { status: 'not_found' };
}
