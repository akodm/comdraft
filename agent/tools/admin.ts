import { defineTool, ToolError } from 'dopus';
import { z } from 'zod';
import { deletePost, banPost, unbanPost } from '@/lib/actions/admin/posts';
import {
  pauseAiGeneration,
  resumeAiGeneration,
} from '@/lib/actions/admin/ai-control';
import {
  resetPromptOverride,
  restorePromptRevision,
  savePromptOverride,
} from '@/lib/actions/admin/ai-prompts';
import { deletePromptHistory } from '@/lib/actions/admin/prompt-history';
import {
  banUser,
  changeUserPlan,
  resetUserUsage,
  revokeUserSessions,
  unbanUser,
} from '@/lib/actions/admin/users';
import {
  getPromptEditor,
  listPromptOverview,
} from '@/lib/admin/ai-prompt-queries';
import {
  getPostDailyViews,
  getPostDetail,
  listPosts,
} from '@/lib/admin/post-queries';
import { VIEW_RANGES } from '@/lib/admin/post-views';
import {
  getPromptDetail,
  listPromptHistory,
} from '@/lib/admin/prompt-history-queries';
import { type AdminAction, canPerform } from '@/lib/admin/roles';
import { getAiGenerationState } from '@/lib/admin/service-setting';
import {
  getActiveJobs,
  getDashboardStats,
  getRecentAdminActions,
} from '@/lib/admin/stats-queries';
import { getUserDetail, listUsers } from '@/lib/admin/user-queries';
import type { AdminRole } from '@/lib/db/schema/admin';
import { POST_VISIBILITIES } from '@/lib/db/schema/post';
import { LOCALES } from '@/lib/i18n/config';

/**
 * 어드민 콘솔에서 할 수 있는 모든 조회·조치를 에이전트 도구로 등록
 * - access: 그 권한으로 할 수 있는 조치일 때만 모델에 도구를 보여 줌 (roles.ts 권한 표 그대로)
 *   viewer → 조회 / editor → 조회 + 중요하지 않은 조치 / admin → 전부
 * - 실제 권한 확인은 각 서버 함수(조회 함수·서버 액션)의 requireAdmin 이 다시 함 (access 는 보여 줄지만 정함)
 * - 데이터를 바꾸는 도구는 모두 confirm: true (채팅에서 입력값을 보고 매번 승인)
 * - 어드민 로그인·비밀번호 변경·로그아웃은 도구로 두지 않음
 */

// 도구를 모델에 보여 줄지: 그 권한으로 할 수 있는 조치인지
export const allows =
  (action: AdminAction) =>
  (user: { role: AdminRole }): boolean =>
    canPerform(user.role, action);

// 서버 액션은 FormData 를 받으므로 같은 필드 이름으로 만들어 넘김
const form = (fields: Record<string, string>): FormData => {
  const data = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }

  return data;
};

/**
 * 서버 액션의 실패 코드(예: job_active, invalid_reason)를 모델이 읽을 수 있는 ToolError 로 바꿈
 * - 그냥 던진 오류는 dopus 가 일반 문구로만 넘기므로, 왜 실패했는지 모델이 알 수 없음
 * - redirect·forbidden 같은 Next 제어 오류(digest 가 있음)는 그대로 던져 dopus 가 해석하게 둠
 */
const runAction = async <T>(action: () => Promise<T>): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    if (
      error instanceof Error &&
      !('digest' in error) &&
      /^[a-z_]+$/.test(error.message)
    ) {
      throw new ToolError(`Action failed: ${error.message}`);
    }

    throw error;
  }
};

const done = { ok: true } as const;

const userId = z.string().min(1).describe('Service user id');
const postId = z.string().min(1).describe('Post id');
const jobId = z.string().min(1).describe('Prompt history (generation job) id');
const reason = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .describe('Reason, shown in the admin log');
const page = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe('Page number, 50 rows per page');
const query = z.string().max(100).optional();
const locale = z.enum(LOCALES);
const promptKey = z
  .string()
  .min(1)
  .describe(
    'Editable prompt key, e.g. "write.system" or "tone.plain" (see listAiPrompts)',
  );

export const adminTools = {
  // ── 조회 (viewer 이상) ──────────────────────────────────────────────
  getDashboard: defineTool(
    async () => {
      const now = new Date();
      const [stats, activeJobs, recentActions] = await Promise.all([
        getDashboardStats(now),
        getActiveJobs(now),
        getRecentAdminActions(20),
      ]);

      return { stats, activeJobs, recentActions };
    },
    {
      description:
        'Dashboard: user/post/AI usage stats for this week, AI jobs in progress (stale ones flagged), and the latest 20 admin actions.',
      usage:
        'When the admin asks for an overview, statistics, running AI jobs or recent admin actions.',
      input: z.object({}),
      access: allows('view'),
    },
  ),
  listUsers: defineTool(
    async (input) => listUsers({ q: input.q ?? '', page: input.page ?? 1 }),
    {
      description:
        'Lists service users (email, GitHub login, plan, weekly usage %, ban state), 50 per page.',
      usage:
        'When the admin asks about users. Use q to search by email or GitHub login.',
      input: z.object({ q: query, page }),
      access: allows('view'),
    },
  ),
  getUser: defineTool(async (input) => getUserDetail(input.userId), {
    description:
      "One service user's details: plan, weekly usage and limit, sessions, post count, recent jobs, related admin actions.",
    usage:
      'Before acting on a user, or when the admin asks about one user. Find the id with listUsers.',
    input: z.object({ userId }),
    access: allows('view'),
  }),
  listPosts: defineTool(
    async (input) =>
      listPosts({
        q: input.q ?? '',
        page: input.page ?? 1,
        visibility: input.visibility ?? null,
        locale: input.locale ?? null,
      }),
    {
      description:
        'Lists published posts (title, author, visibility, locale, published date, views, ban state), 50 per page.',
      usage: 'When the admin asks about posts. q searches title and author.',
      input: z.object({
        q: query,
        page,
        visibility: z.enum(POST_VISIBILITIES).optional(),
        locale: locale.optional(),
      }),
      access: allows('view'),
    },
  ),
  getPost: defineTool(async (input) => getPostDetail(input.postId), {
    description: "One post's details and related admin actions.",
    usage:
      'Before acting on a post, or when the admin asks about one post. Find the id with listPosts.',
    input: z.object({ postId }),
    access: allows('view'),
  }),
  getPostViews: defineTool(
    async (input) => getPostDailyViews(input.postId, input.days ?? 30),
    {
      description:
        "One post's views per day (KST dates, 0 on days without views) for the last 7, 30 or 90 days. Each visitor counts once per 30 days.",
      usage:
        'When the admin asks how views changed over time for a post. Find the id with listPosts.',
      input: z.object({
        postId,
        days: z
          .union(VIEW_RANGES.map((days) => z.literal(days)))
          .optional()
          .describe('7, 30 (default) or 90'),
      }),
      access: allows('view'),
    },
  ),
  listPromptHistory: defineTool(
    async (input) =>
      listPromptHistory({ q: input.q ?? '', page: input.page ?? 1 }),
    {
      description:
        "Lists users' AI writing requests (user, draft, first 80 chars of the request, model, status, cost, hidden flag), 50 per page.",
      usage: 'When the admin asks about generation requests or prompt history.',
      input: z.object({ q: query, page }),
      access: allows('view'),
    },
  ),
  getPromptHistory: defineTool(async (input) => getPromptDetail(input.jobId), {
    description:
      'One AI writing request in full: request text, options, commits, reference links, error code, tokens and cost.',
    usage:
      'When the admin asks about one request. Find the id with listPromptHistory.',
    input: z.object({ jobId }),
    access: allows('view'),
  }),
  listAiPrompts: defineTool(async () => listPromptOverview(), {
    description:
      'Lists the editable AI prompt keys per locale with status (default / applied override / ignored override) and last editor.',
    usage: 'When the admin asks about the AI prompts or wants to edit one.',
    input: z.object({}),
    access: allows('view'),
  }),
  getAiPrompt: defineTool(
    async (input) => getPromptEditor(input.locale, input.key),
    {
      description:
        'One AI prompt key: default text, current override, required strings that must stay in any edit, status and revision history (with revision ids).',
      usage:
        'Before editing or restoring a prompt, or when the admin asks about one prompt key.',
      input: z.object({ locale, key: promptKey }),
      access: allows('view'),
    },
  ),
  getAiGenerationState: defineTool(async () => getAiGenerationState(), {
    description:
      'Whether AI writing is paused for the whole service, with the reason and who changed it last.',
    usage: 'When the admin asks whether AI writing is running or paused.',
    input: z.object({}),
    access: allows('view'),
  }),

  // ── 조치 (editor 이상) ─────────────────────────────────────────────
  banUser: defineTool(
    async (input) =>
      runAction(async () => {
        await banUser(form({ userId: input.userId, reason: input.reason }));
        return done;
      }),
    {
      description:
        'Bans a service user: blocks sign-in and AI writing and signs them out of every session. Their posts stay.',
      usage: 'Only when the admin explicitly asks to ban a user.',
      input: z.object({ userId, reason }),
      access: allows('user.ban'),
      confirm: true,
    },
  ),
  unbanUser: defineTool(
    async (input) =>
      runAction(async () => {
        await unbanUser(form({ userId: input.userId }));
        return done;
      }),
    {
      description: 'Lifts a ban on a service user.',
      usage: 'Only when the admin explicitly asks to unban a user.',
      input: z.object({ userId }),
      access: allows('user.unban'),
      confirm: true,
    },
  ),
  revokeUserSessions: defineTool(
    async (input) =>
      runAction(async () => {
        await revokeUserSessions(form({ userId: input.userId }));
        return done;
      }),
    {
      description:
        'Signs a service user out of every session (they can sign in again).',
      usage: 'Only when the admin explicitly asks to sign a user out.',
      input: z.object({ userId }),
      access: allows('user.revokeSessions'),
      confirm: true,
    },
  ),
  resetUserUsage: defineTool(
    async (input) =>
      runAction(async () => {
        await resetUserUsage(form({ userId: input.userId }));
        return done;
      }),
    {
      description:
        "Resets a user's weekly AI usage: only jobs after now count this week. Job records are kept.",
      usage: "Only when the admin explicitly asks to reset a user's usage.",
      input: z.object({ userId }),
      access: allows('user.resetUsage'),
      confirm: true,
    },
  ),
  changeUserPlan: defineTool(
    async (input) =>
      runAction(async () => {
        await changeUserPlan(form({ userId: input.userId, role: input.plan }));
        return done;
      }),
    {
      description:
        "Changes a user's plan (e.g. basic, pro, max). Usage is kept, so a downgrade can show over 100%.",
      usage:
        "Only when the admin explicitly asks to change a user's plan. Unknown plans are rejected.",
      input: z.object({
        userId,
        plan: z.string().min(1).describe('Plan name from quota_plan'),
      }),
      access: allows('user.changePlan'),
      confirm: true,
    },
  ),
  banPost: defineTool(
    async (input) =>
      runAction(async () => {
        await banPost(form({ postId: input.postId, reason: input.reason }));
        return done;
      }),
    {
      description:
        'Temporarily hides a post: removed from lists and the sitemap, its page shows only a notice. Not deleted.',
      usage: 'Only when the admin explicitly asks to ban or hide a post.',
      input: z.object({ postId, reason }),
      access: allows('post.ban'),
      confirm: true,
    },
  ),
  unbanPost: defineTool(
    async (input) =>
      runAction(async () => {
        await unbanPost(form({ postId: input.postId }));
        return done;
      }),
    {
      description: 'Restores a banned post.',
      usage: 'Only when the admin explicitly asks to unban a post.',
      input: z.object({ postId }),
      access: allows('post.unban'),
      confirm: true,
    },
  ),
  saveAiPrompt: defineTool(
    async (input) =>
      runAction(async () =>
        savePromptOverride(
          {},
          form({
            locale: input.locale,
            key: input.key,
            content: input.content,
          }),
        ),
      ),
    {
      description:
        'Saves an override for one AI prompt key. Rejected (with the reason in the result) if empty, over 20,000 chars or missing a required string. The previous text goes to the revision history.',
      usage:
        'Only when the admin asks to change a prompt. Read it with getAiPrompt first and keep every required string.',
      input: z.object({
        locale,
        key: promptKey,
        content: z.string().min(1).max(20000),
      }),
      access: allows('prompt.edit'),
      confirm: true,
    },
  ),
  resetAiPrompt: defineTool(
    async (input) =>
      runAction(async () => {
        await resetPromptOverride(
          form({ locale: input.locale, key: input.key }),
        );
        return done;
      }),
    {
      description:
        'Removes the override of one AI prompt key so the default text is used again (kept in history).',
      usage: 'Only when the admin asks to reset a prompt to its default.',
      input: z.object({ locale, key: promptKey }),
      access: allows('prompt.edit'),
      confirm: true,
    },
  ),
  restoreAiPromptRevision: defineTool(
    async (input) =>
      runAction(async () => {
        await restorePromptRevision(form({ revisionId: input.revisionId }));
        return done;
      }),
    {
      description:
        'Re-applies a past revision of an AI prompt (checked like a save).',
      usage:
        'Only when the admin asks to restore an earlier version. Get revision ids from getAiPrompt.',
      input: z.object({ revisionId: z.string().min(1) }),
      access: allows('prompt.edit'),
      confirm: true,
    },
  ),

  // ── 중대 조치 (admin 만) ───────────────────────────────────────────
  deletePost: defineTool(
    async (input) =>
      runAction(async () => {
        await deletePost(form({ postId: input.postId }));
        return done;
      }),
    {
      description:
        'Permanently deletes a published post; its source draft goes back to draft status. Cannot be undone.',
      usage:
        'Only when the admin explicitly asks to delete a post (banPost hides it reversibly instead).',
      input: z.object({ postId }),
      access: allows('post.delete'),
      confirm: true,
    },
  ),
  hidePromptHistory: defineTool(
    async (input) =>
      runAction(async () => {
        await deletePromptHistory(form({ jobId: input.jobId }));
        return done;
      }),
    {
      description:
        "Hides one AI writing request from the user's screens. Its cost still counts toward usage. Jobs still in progress are rejected.",
      usage: 'Only when the admin explicitly asks to delete or hide a request.',
      input: z.object({ jobId }),
      access: allows('history.delete'),
      confirm: true,
    },
  ),
  pauseAiGeneration: defineTool(
    async (input) =>
      runAction(async () => {
        await pauseAiGeneration(form({ reason: input.reason }));
        return done;
      }),
    {
      description:
        'Pauses AI writing for the whole service (new requests are rejected; running jobs finish). Last-resort defense, e.g. against bot abuse.',
      usage: 'Only when the admin explicitly asks to stop or pause AI writing.',
      input: z.object({ reason }),
      access: allows('ai.pause'),
      confirm: true,
    },
  ),
  resumeAiGeneration: defineTool(
    async () =>
      runAction(async () => {
        await resumeAiGeneration();
        return done;
      }),
    {
      description: 'Resumes AI writing for the whole service after a pause.',
      usage: 'Only when the admin explicitly asks to resume AI writing.',
      input: z.object({}),
      access: allows('ai.resume'),
      confirm: true,
    },
  ),
};
