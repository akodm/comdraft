import 'server-only';
import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { draftPrompt, post, user } from '@/lib/db/schema';
import type { ServiceStats } from '@/lib/report/format';

/**
 * 운영 DB 의 어제 하루 서비스 지표 (한국 시간 하루를 UTC 시각 범위로 받음)
 * - 신규 가입, AI 작성 요청(완료·실패), 처음 게시한 글 수 (다시 게시는 세지 않음)
 */
export const fetchServiceStats = async ({
  start,
  end,
}: {
  start: Date;
  end: Date;
}): Promise<ServiceStats> => {
  const createdIn = and(
    gte(draftPrompt.createdAt, start),
    lt(draftPrompt.createdAt, end),
  );

  const [
    newUsers,
    generations,
    completedGenerations,
    failedGenerations,
    publishedPosts,
  ] = await Promise.all([
    db.$count(user, and(gte(user.createdAt, start), lt(user.createdAt, end))),
    db.$count(draftPrompt, createdIn),
    db.$count(draftPrompt, and(createdIn, eq(draftPrompt.status, 'completed'))),
    db.$count(draftPrompt, and(createdIn, eq(draftPrompt.status, 'failed'))),
    db.$count(
      post,
      and(gte(post.publishedAt, start), lt(post.publishedAt, end)),
    ),
  ]);

  return {
    newUsers,
    generations,
    completedGenerations,
    failedGenerations,
    publishedPosts,
  };
};
