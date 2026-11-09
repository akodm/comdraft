'use server';

import { and, eq } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { draft, draftPrompt, draftReferenceLink } from '@/lib/db/schema';
import { COMMITS_PER_PAGE, listRepositoryCommits } from '@/lib/github/commits';
import { GithubApiError, GithubUserTokenError } from '@/lib/github/user-api';
import {
  extractDraftTitle,
  getCommitSubject,
  isDraftDocument,
  MAX_DRAFT_CONTENT_LENGTH,
} from '@/lib/studio/draft-content';
import { buildDraftStub } from '@/lib/studio/draft-stub';
import { parsePromptOptions } from '@/lib/studio/options';
import { getStudioRepository } from '@/lib/studio/queries';
import { parseReferenceUrls } from '@/lib/studio/reference-link';

// 커밋 내역 사이드바에 필요한 값만 전달 (커밋 내용은 저장하지 않음)
export interface StudioCommit {
  sha: string;
  // 커밋 메시지 첫 줄
  subject: string;
  htmlUrl: string;
}

export type StudioCommitsResult =
  | { status: 'ok'; commits: StudioCommit[]; hasNextPage: boolean }
  // GitHub 토큰 만료/갱신 실패 → 다시 로그인 필요
  | { status: 'github_reauth' }
  // 연동하지 않은 저장소이거나 GitHub 에서 저장소 권한이 해제됨
  | { status: 'unavailable' };

// GitHub 페이지 번호 상한 (30개씩 3만 개)
const MAX_COMMIT_PAGE = 1000;

/**
 * 스튜디오 커밋 내역 한 페이지 (추적 브랜치, 최신순 30개)
 * - 커밋은 DB 에 저장하지 않고 매번 사용자 토큰으로 GitHub API 를 조회
 */
export async function loadStudioCommits(
  repositoryId: string,
  page: number,
): Promise<StudioCommitsResult> {
  const { user } = await requireSession();

  if (!Number.isInteger(page) || page < 1 || page > MAX_COMMIT_PAGE) {
    return { status: 'ok', commits: [], hasNextPage: false };
  }

  try {
    const result = await listRepositoryCommits({
      userId: user.id,
      requestHeaders: await headers(),
      repositoryId,
      page,
      perPage: COMMITS_PER_PAGE,
    });

    if (!result) {
      return { status: 'unavailable' };
    }

    return {
      status: 'ok',
      hasNextPage: result.hasNextPage,
      commits: result.commits.map(({ sha, message, htmlUrl }) => ({
        sha,
        subject: getCommitSubject(message),
        htmlUrl,
      })),
    };
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return { status: 'github_reauth' };
    }

    // 409: 커밋이 하나도 없는 빈 저장소
    if (error instanceof GithubApiError && error.status === 409) {
      return { status: 'ok', commits: [], hasNextPage: false };
    }

    // 403/404: GitHub 에서 저장소 권한이 해제되었거나 브랜치가 삭제됨
    if (
      error instanceof GithubApiError &&
      (error.status === 403 || error.status === 404)
    ) {
      return { status: 'unavailable' };
    }

    throw error;
  }
}

export interface SubmitDraftPromptInput {
  repositoryId: string;
  // null 이면 새 초안
  draftId: string | null;
  prompt: string;
  options: unknown;
  // 선택한 커밋 (최신순)
  commits: Array<{ sha: string; subject: string }>;
  // 새 초안에 함께 저장할 참고 링크 (기존 초안은 링크를 바로 저장하므로 보내지 않음)
  referenceLinks?: string[];
}

export type SubmitDraftPromptResult =
  // 새 초안을 만듦 → 클라이언트가 초안 화면으로 이동
  | { status: 'created'; draftId: string }
  // 기존 초안에 요청만 기록 (AI 생성 미연동)
  | { status: 'saved' }
  | { status: 'invalid' }
  | { status: 'not_found' };

const MAX_PROMPT_LENGTH = 4000;
const MAX_COMMITS = 100;
const MAX_SUBJECT_LENGTH = 300;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

const parseCommits = (value: unknown) => {
  if (!Array.isArray(value) || value.length > MAX_COMMITS) {
    return null;
  }

  const commits = value.map((item: unknown) => {
    const { sha, subject } = (item ?? {}) as Record<string, unknown>;

    return typeof sha === 'string' &&
      SHA_PATTERN.test(sha) &&
      typeof subject === 'string'
      ? { sha, subject: subject.slice(0, MAX_SUBJECT_LENGTH) }
      : null;
  });

  return commits.every((commit) => commit !== null) ? commits : null;
};

/**
 * 작성 요청 제출
 * - [임시] AI 생성을 연동하기 전이라 LLM 을 호출하지 않음
 *   - 새 초안: 선택한 커밋으로 초안 뼈대를 만들어 저장 (lib/studio/draft-stub.ts)
 *   - 기존 초안: 본문은 그대로 두고 요청 기록만 저장
 * - 요청 문구, 기본 옵션, 커밋 SHA 는 draft_prompt 에 기록 (커밋 메시지는 저장하지 않음)
 * - 새 초안을 만들기 전에 추가한 참고 링크는 초안과 함께 저장
 */
export async function submitDraftPrompt(
  input: SubmitDraftPromptInput,
): Promise<SubmitDraftPromptResult> {
  const { user } = await requireSession();
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const options = parsePromptOptions(input.options);
  const commits = parseCommits(input.commits);
  const draftId = typeof input.draftId === 'string' ? input.draftId : null;
  const referenceUrls = parseReferenceUrls(input.referenceLinks);

  if (
    !prompt ||
    prompt.length > MAX_PROMPT_LENGTH ||
    !options ||
    !commits ||
    !referenceUrls ||
    // 새 초안은 커밋을 하나 이상 선택해야 만들 수 있음
    (!draftId && commits.length === 0)
  ) {
    return { status: 'invalid' };
  }

  const repository = await getStudioRepository(user.id, input.repositoryId);

  if (!repository) {
    return { status: 'not_found' };
  }

  const promptValues = {
    prompt,
    tone: options.tone,
    postType: options.postType,
    length: options.length,
    requiredBlocks: options.requiredBlocks,
    commitShas: commits.map(({ sha }) => sha),
  };

  if (draftId) {
    const saved = await db.transaction(async (tx) => {
      // 최근 수정순 목록의 맨 위로 올림
      const [touched] = await tx
        .update(draft)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(draft.id, draftId),
            eq(draft.userId, user.id),
            eq(draft.repositoryId, repository.id),
          ),
        )
        .returning({ id: draft.id });

      if (!touched) {
        return false;
      }

      await tx.insert(draftPrompt).values({
        id: crypto.randomUUID(),
        draftId: touched.id,
        ...promptValues,
      });

      return true;
    });

    if (!saved) {
      return { status: 'not_found' };
    }

    refresh();

    return { status: 'saved' };
  }

  const content = buildDraftStub({ prompt, commits });
  const newDraftId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(draft).values({
      id: newDraftId,
      userId: user.id,
      repositoryId: repository.id,
      title: extractDraftTitle(content),
      content,
    });
    await tx.insert(draftPrompt).values({
      id: crypto.randomUUID(),
      draftId: newDraftId,
      ...promptValues,
    });

    if (referenceUrls.length > 0) {
      await tx.insert(draftReferenceLink).values(
        referenceUrls.map((url) => ({
          id: crypto.randomUUID(),
          draftId: newDraftId,
          url,
        })),
      );
    }
  });

  // 레이아웃의 초안 목록에 새 초안이 보이도록 현재 화면을 다시 렌더링
  refresh();

  return { status: 'created', draftId: newDraftId };
}

export type SaveDraftContentResult =
  | { status: 'saved'; title: string }
  | { status: 'invalid' }
  | { status: 'not_found' };

// 클라이언트가 보낸 본문 JSON 문자열을 Tiptap 문서로 (형식이 맞지 않으면 null)
const parseDraftDocument = (contentJson: unknown) => {
  if (
    typeof contentJson !== 'string' ||
    contentJson.length > MAX_DRAFT_CONTENT_LENGTH
  ) {
    return null;
  }

  try {
    const content: unknown = JSON.parse(contentJson);

    return isDraftDocument(content) ? content : null;
  } catch {
    return null;
  }
};

/**
 * 편집기 자동 저장 (본문 + 목록 표시용 제목)
 * - 본문은 JSON 문자열로 받음: ProseMirror 의 attrs 는 프로토타입 없는 객체라
 *   Server Action 인자로 그대로 넘기면 직렬화 과정에서 빠짐 (제목 단계, 링크 주소, 코드 언어 등)
 * - 목록 순서가 매번 바뀌지 않도록 화면은 다시 렌더링하지 않고, 바뀐 제목만 돌려줌
 */
export async function saveDraftContent(
  repositoryId: string,
  draftId: string,
  contentJson: string,
): Promise<SaveDraftContentResult> {
  const { user } = await requireSession();
  const content = parseDraftDocument(contentJson);

  if (!content) {
    return { status: 'invalid' };
  }

  const title = extractDraftTitle(content);
  const [updated] = await db
    .update(draft)
    .set({ content, title })
    .where(
      and(
        eq(draft.id, draftId),
        eq(draft.userId, user.id),
        eq(draft.repositoryId, repositoryId),
      ),
    )
    .returning({ id: draft.id });

  return updated ? { status: 'saved', title } : { status: 'not_found' };
}

export type DeleteDraftResult = { status: 'deleted' } | { status: 'not_found' };

/**
 * 초안 삭제 (본인이 해당 저장소에 만든 초안만, 작성 요청 기록과 참고 링크도 함께 삭제)
 * - 화면은 다시 렌더링하지 않음: 열려 있는 초안이면 다시 그리는 순간 404 가 되므로,
 *   목록에서 숨기고 다른 초안으로 옮기는 일은 클라이언트가 처리
 */
export async function deleteDraft(
  repositoryId: string,
  draftId: string,
): Promise<DeleteDraftResult> {
  const { user } = await requireSession();
  const deleted = await db
    .delete(draft)
    .where(
      and(
        eq(draft.id, draftId),
        eq(draft.userId, user.id),
        eq(draft.repositoryId, repositoryId),
      ),
    )
    .returning({ id: draft.id });

  return deleted.length > 0 ? { status: 'deleted' } : { status: 'not_found' };
}
