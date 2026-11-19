'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  aiPrompt,
  aiPromptDefault,
  aiPromptRevision,
} from '@/lib/db/schema/admin';
import { logAdminAction } from '@/lib/admin/audit';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import { validatePromptOverride } from '@/lib/admin/prompt-validation';
import { getRequestLocale } from '@/lib/i18n/request';

// 저장 폼의 결과 (검사 실패는 던지지 않고 화면에 보여 줌)
export interface SavePromptState {
  error?: 'empty' | 'too_long' | 'missing_markers' | 'unchanged';
  missing?: string[];
  saved?: boolean;
}

type PromptOp = 'save' | 'reset' | 'restore';

interface PromptTarget {
  locale: string;
  key: string;
}

const readField = (formData: FormData, name: string): string => {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
};

const readTarget = (formData: FormData): PromptTarget => ({
  locale: readField(formData, 'locale').trim(),
  key: readField(formData, 'key').trim(),
});

const matchesTarget = ({ locale, key }: PromptTarget) =>
  and(eq(aiPrompt.locale, locale), eq(aiPrompt.key, key));

// 목록과 해당 편집 화면을 다시 읽도록 표시 (키에 점이 있어 주소용으로 인코딩)
const revalidatePrompt = async ({ locale, key }: PromptTarget) => {
  const base = adminPath(
    await getRequestLocale(),
    requireAdminKey(),
    'ai-prompts',
  );

  revalidatePath(base);
  revalidatePath(`${base}/${locale}/${encodeURIComponent(key)}`);
};

const logPromptEdit = (adminId: string, target: PromptTarget, op: PromptOp) =>
  logAdminAction({
    adminId,
    action: 'prompt.edit',
    targetType: 'ai_prompt',
    targetId: `${target.locale}:${target.key}`,
    // 프롬프트 원문은 남기지 않음
    detail: { locale: target.locale, key: target.key, op },
  });

// 지금의 수정본 내용 (없으면 null)
const loadOverride = async (target: PromptTarget): Promise<string | null> => {
  const [row] = await db
    .select({ content: aiPrompt.content })
    .from(aiPrompt)
    .where(matchesTarget(target))
    .limit(1);

  return row?.content ?? null;
};

const recordRevision = (
  tx: Pick<typeof db, 'insert'>,
  target: PromptTarget,
  content: string | null,
  adminId: string,
) =>
  tx.insert(aiPromptRevision).values({
    id: crypto.randomUUID(),
    ...target,
    content,
    adminId,
  });

/**
 * 수정본 저장 공통 처리 (저장·되돌리기 복원)
 * - 기본값 행이 없으면 오류, Lambda 와 같은 검사를 통과해야 저장
 * - 이전 수정본(없으면 null)을 이력에 남기고 upsert 를 한 트랜잭션으로 함
 */
const applyOverride = async (
  adminId: string,
  target: PromptTarget,
  content: string,
  op: PromptOp,
): Promise<SavePromptState> => {
  const [base] = await db
    .select({ requiredMarkers: aiPromptDefault.requiredMarkers })
    .from(aiPromptDefault)
    .where(
      and(
        eq(aiPromptDefault.locale, target.locale),
        eq(aiPromptDefault.key, target.key),
      ),
    )
    .limit(1);

  if (!base) {
    throw new Error('unknown_prompt');
  }

  const result = validatePromptOverride(content, base.requiredMarkers);

  if (!result.ok) {
    return { error: result.reason, missing: result.missing };
  }

  const current = await loadOverride(target);

  if (current === content) {
    return { error: 'unchanged' };
  }

  await db.transaction(async (tx) => {
    await recordRevision(tx, target, current, adminId);
    await tx
      .insert(aiPrompt)
      .values({ ...target, content, updatedBy: adminId })
      .onConflictDoUpdate({
        target: [aiPrompt.locale, aiPrompt.key],
        set: { content, updatedBy: adminId, updatedAt: new Date() },
      });
  });

  await logPromptEdit(adminId, target, op);
  await revalidatePrompt(target);

  return { saved: true };
};

// 수정본을 이력에 남기고 지움 (없으면 아무것도 하지 않음)
const clearOverride = async (
  adminId: string,
  target: PromptTarget,
  op: PromptOp,
): Promise<void> => {
  const current = await loadOverride(target);

  if (current === null) {
    return;
  }

  await db.transaction(async (tx) => {
    await recordRevision(tx, target, current, adminId);
    await tx.delete(aiPrompt).where(matchesTarget(target));
  });

  await logPromptEdit(adminId, target, op);
  await revalidatePrompt(target);
};

/** 프롬프트 수정본 저장 (editor): useActionState 용, 검사 실패는 상태로 돌려줌 */
export async function savePromptOverride(
  _prev: SavePromptState,
  formData: FormData,
): Promise<SavePromptState> {
  const admin = await requireAdmin('prompt.edit');

  return applyOverride(
    admin.adminId,
    readTarget(formData),
    readField(formData, 'content'),
    'save',
  );
}

/** 기본값으로 되돌리기: 수정본을 이력에 남기고 지움 */
export async function resetPromptOverride(formData: FormData): Promise<void> {
  const admin = await requireAdmin('prompt.edit');

  await clearOverride(admin.adminId, readTarget(formData), 'reset');
}

/** 이력의 값으로 되돌리기: null 이면 기본값으로, 아니면 저장과 같은 검사를 거침 */
export async function restorePromptRevision(formData: FormData): Promise<void> {
  const admin = await requireAdmin('prompt.edit');
  const revisionId = readField(formData, 'revisionId').trim();

  const [revision] = await db
    .select({
      locale: aiPromptRevision.locale,
      key: aiPromptRevision.key,
      content: aiPromptRevision.content,
    })
    .from(aiPromptRevision)
    .where(eq(aiPromptRevision.id, revisionId))
    .limit(1);

  if (!revision) {
    throw new Error('unknown_revision');
  }

  const target = { locale: revision.locale, key: revision.key };

  if (revision.content === null) {
    await clearOverride(admin.adminId, target, 'restore');

    return;
  }

  const result = await applyOverride(
    admin.adminId,
    target,
    revision.content,
    'restore',
  );

  // 같은 내용이면 할 일이 없고, 그 밖의 검사 실패는 오류로 알림
  if (result.error && result.error !== 'unchanged') {
    throw new Error(result.error);
  }
}
