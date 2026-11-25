import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { getAiGenerationSetting } from '@/lib/admin/service-setting';
import { db } from '@/lib/db';
import {
  draft,
  draftPrompt,
  draftReferenceLink,
  type DraftPromptSource,
} from '@/lib/db/schema';
import { toCodeInputMeta } from '@/lib/generation/code-input';
import type { GenerationCodeInput } from '@/lib/generation/contract';
import {
  expireStaleJobs,
  isActiveJobConflict,
  isTriggerDuplicateConflict,
  reserveGenerationSlot,
} from '@/lib/generation/jobs';
import { getUserQuota } from '@/lib/generation/quota-queries';
import {
  getGenerationBlock,
  type GenerationBlock,
} from '@/lib/generation/service-block';
import type { GenerationSlotStatus } from '@/lib/generation/slot';
import type { Locale } from '@/lib/i18n/config';
import {
  getGithubUserToken,
  GithubUserTokenError,
} from '@/lib/github/user-api';
import type { PromptOptions } from '@/lib/studio/options';

/**
 * 초안 작업 생성과 사용자 단위 검사 (스튜디오 요청과 커밋 웹훅 공용)
 * - 'use server' 파일에 두면 export 가 전부 서버 액션이 되므로 별도 모듈로 둠
 */

// 작업을 만들 때 시간당 요청 수·동시 진행 수에 걸린 이유
export type SlotRejection = Exclude<GenerationSlotStatus, 'ok'>;

// 작업 만들기 결과 (초안 작성과 빈칸 채우기 공용)
export type CreateJobResult<T> =
  | ({ status: 'created' } & T)
  | { status: 'busy' }
  | { status: SlotRejection };

export interface ParsedRequest {
  prompt: string;
  options: PromptOptions;
  commitShas: string[];
  codeInputs: GenerationCodeInput[];
  referenceUrls: string[];
  draftId: string | null;
}

// 초안 작업 요청: 사용자 요청 값 + 요청 출처 (자동 초안은 트리거 커밋 SHA 로 중복을 막음)
export interface DraftJobRequest extends ParsedRequest {
  source: DraftPromptSource;
  triggerSha: string | null;
}

// 초안 작업 만들기 결과 (같은 트리거 SHA 로 이미 만들었으면 duplicate)
export type CreateDraftJobResult =
  | CreateJobResult<{
      draftId: string;
      jobId: string;
    }>
  | { status: 'duplicate' };

/**
 * 작업(queued)을 만들고 초안 id 와 작업 id 반환 (새 초안이면 초안과 참고 링크도 함께 생성)
 * - 같은 트랜잭션에서 사용자 잠금을 잡고 시간당 요청 수·동시 진행 수를 센 뒤 INSERT
 *   (한도에 걸리면 아무것도 만들지 않고 rate_limited·too_many_active)
 * - 같은 초안에 진행 중인 작업이 있으면 유일 인덱스에 걸려 'busy'
 * - 같은 트리거 SHA 로 이미 만든 작업이 있으면 유일 인덱스에 걸려 'duplicate'
 */
export const createDraftJob = async (
  userId: string,
  repositoryId: string,
  request: DraftJobRequest,
  locale: Locale,
): Promise<CreateDraftJobResult> => {
  const draftId = request.draftId ?? crypto.randomUUID();
  const jobId = crypto.randomUUID();

  try {
    const slot = await db.transaction(async (tx) => {
      const reserved = await reserveGenerationSlot(tx, userId);

      if (reserved !== 'ok') {
        return reserved;
      }

      // 요청 시점의 참고 링크 (작성기는 이 목록만 읽음)
      let referenceUrls = request.referenceUrls;

      if (request.draftId) {
        // 최근 수정순 목록의 맨 위로 올림
        await tx
          .update(draft)
          .set({ updatedAt: new Date() })
          .where(eq(draft.id, draftId));

        const links = await tx
          .select({ url: draftReferenceLink.url })
          .from(draftReferenceLink)
          .where(eq(draftReferenceLink.draftId, draftId))
          .orderBy(
            asc(draftReferenceLink.createdAt),
            asc(draftReferenceLink.id),
          );
        referenceUrls = links.map((link) => link.url);
      } else {
        await tx.insert(draft).values({ id: draftId, userId, repositoryId });

        if (request.referenceUrls.length > 0) {
          await tx.insert(draftReferenceLink).values(
            request.referenceUrls.map((url) => ({
              id: crypto.randomUUID(),
              draftId,
              url,
            })),
          );
        }
      }

      await tx.insert(draftPrompt).values({
        id: jobId,
        userId,
        draftId,
        prompt: request.prompt,
        tone: request.options.tone,
        postType: request.options.postType,
        length: request.options.length,
        requiredBlocks: request.options.requiredBlocks,
        model: request.options.model,
        commitShas: request.commitShas,
        // 이름·줄 수만 저장 (코드 원문은 작성기 요청 본문으로만 보냄)
        codeInputs: toCodeInputMeta(request.codeInputs),
        referenceUrls,
        locale,
        repositoryId,
        source: request.source,
        triggerSha: request.triggerSha,
      });

      return reserved;
    });

    if (slot !== 'ok') {
      return { status: slot };
    }
  } catch (error) {
    if (isActiveJobConflict(error)) {
      return { status: 'busy' };
    }

    if (isTriggerDuplicateConflict(error)) {
      return { status: 'duplicate' };
    }

    throw error;
  }

  return { status: 'created', draftId, jobId };
};

// 작업을 만들기 전 사용자 단위 검사 결과 (통과하면 실행기에 넘길 GitHub 토큰)
export type GenerationGateResult =
  | { status: 'ok'; githubToken: string }
  | { status: GenerationBlock }
  | { status: 'quota_exhausted'; resetsAt: string }
  | { status: 'quota_unavailable' }
  | { status: 'github_reauth' };

// 검사에 쓰는 세션 사용자 값 (bannedAt 은 세션 조회 때 DB 에서 함께 읽음)
export interface GateUser {
  id: string;
  bannedAt?: Date | null;
}

// AI 작성 중지·사용자 밴 확인 (새 요청과 되묻기 재개 공용, 막지 않으면 null)
export const checkGenerationBlock = async (
  user: GateUser,
): Promise<GenerationBlock | null> =>
  getGenerationBlock(await getAiGenerationSetting(), user.bannedAt);

/**
 * 작업을 만들기 전 사용자 단위 검사 (초안 작성과 빈칸 채우기 공용)
 * 1. AI 작성 중지 → 사용자 밴
 * 2. 멈춘 작업 시간 초과 처리 후 이번 주 할당량 (정책이 없거나 소진이면 거부)
 * 3. GitHub 토큰 (실행기 요청 형식에 필요)
 * - requestHeaders: 세션 요청의 헤더 (웹훅처럼 세션이 없으면 null)
 * - 시간당 요청 수와 동시 진행 수는 작업을 만드는 트랜잭션에서 잠금을 잡고 확인 (reserveGenerationSlot)
 *   → 시간 초과 처리를 여기서 먼저 끝내야 멈춘 작업이 진행 중으로 세지지 않음
 */
export const checkGenerationGate = async (
  user: GateUser,
  requestHeaders: Headers | null,
): Promise<GenerationGateResult> => {
  const userId = user.id;
  const block = await checkGenerationBlock(user);

  if (block) {
    return { status: block };
  }

  // 멈춘 작업(Lambda 비정상 종료)의 예상량이 계속 사용량으로 잡히지 않도록 먼저 시간 초과 처리
  await expireStaleJobs({ userId });

  const quota = await getUserQuota(userId);

  if (!quota) {
    return { status: 'quota_unavailable' };
  }

  if (quota.remaining <= 0) {
    return {
      status: 'quota_exhausted',
      resetsAt: quota.resetsAt.toISOString(),
    };
  }

  try {
    return {
      status: 'ok',
      githubToken: await getGithubUserToken(
        userId,
        requestHeaders ?? undefined,
      ),
    };
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return { status: 'github_reauth' };
    }

    throw error;
  }
};
