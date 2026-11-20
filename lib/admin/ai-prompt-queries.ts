import 'server-only';
import { requireAdmin } from '@/lib/admin/guard';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  adminAccount,
  aiPrompt,
  aiPromptDefault,
  aiPromptRevision,
} from '@/lib/db/schema/admin';
import {
  derivePromptStatus,
  type PromptStatus,
} from '@/lib/admin/prompt-status';

/**
 * 어드민 AI 프롬프트 조회 (읽기 전용)
 * - 기본값은 Lambda 가 올린 ai_prompt_default 를 기준으로 함
 */

const REVISION_LIMIT = 20;

export interface PromptOverviewRow {
  locale: string;
  key: string;
  // default: 기본값 사용, applied: 수정본 적용 중, ignored: 수정본이 있지만 Lambda 가 무시함
  status: PromptStatus;
  editorLoginId: string | null;
  updatedAt: Date | null;
}

// ko 를 먼저, 나머지는 이름순
const localeOrder = (locale: string): number => (locale === 'ko' ? 0 : 1);

// 기본값 행 전체와 수정 여부, 마지막 수정자·시각
export const listPromptOverview = async (): Promise<PromptOverviewRow[]> => {
  // 페이지를 거치지 않는 호출(에이전트 도구 등)도 여기서 조회 권한(view)을 확인
  await requireAdmin('view');

  const rows = await db
    .select({
      locale: aiPromptDefault.locale,
      key: aiPromptDefault.key,
      requiredMarkers: aiPromptDefault.requiredMarkers,
      overrideContent: aiPrompt.content,
      editorLoginId: adminAccount.loginId,
      updatedAt: aiPrompt.updatedAt,
    })
    .from(aiPromptDefault)
    .leftJoin(
      aiPrompt,
      and(
        eq(aiPrompt.locale, aiPromptDefault.locale),
        eq(aiPrompt.key, aiPromptDefault.key),
      ),
    )
    .leftJoin(adminAccount, eq(adminAccount.id, aiPrompt.updatedBy))
    .orderBy(asc(aiPromptDefault.locale), asc(aiPromptDefault.key));

  return rows
    .map((row) => ({
      locale: row.locale,
      key: row.key,
      status: derivePromptStatus(row.overrideContent, row.requiredMarkers)
        .status,
      editorLoginId: row.editorLoginId,
      updatedAt: row.updatedAt,
    }))
    .sort((a, b) => localeOrder(a.locale) - localeOrder(b.locale));
};

export interface PromptRevisionRow {
  id: string;
  // null 이면 기본값으로 되돌리기 직전에 수정본이 없었다는 뜻
  content: string | null;
  adminLoginId: string | null;
  createdAt: Date;
}

export interface PromptEditorData {
  defaultContent: string;
  requiredMarkers: string[];
  overrideContent: string | null;
  status: PromptStatus;
  // 수정본이 무시될 때 빠진 필수 문자열
  missingMarkers: string[];
  editorLoginId: string | null;
  updatedAt: Date | null;
  revisions: PromptRevisionRow[];
}

// 편집 화면 데이터 (기본값 행이 없으면 null)
export const getPromptEditor = async (
  locale: string,
  key: string,
): Promise<PromptEditorData | null> => {
  // 페이지를 거치지 않는 호출(에이전트 도구 등)도 여기서 조회 권한(view)을 확인
  await requireAdmin('view');

  const [base] = await db
    .select({
      content: aiPromptDefault.content,
      requiredMarkers: aiPromptDefault.requiredMarkers,
    })
    .from(aiPromptDefault)
    .where(
      and(eq(aiPromptDefault.locale, locale), eq(aiPromptDefault.key, key)),
    )
    .limit(1);

  if (!base) {
    return null;
  }

  const [override] = await db
    .select({
      content: aiPrompt.content,
      updatedAt: aiPrompt.updatedAt,
      editorLoginId: adminAccount.loginId,
    })
    .from(aiPrompt)
    .leftJoin(adminAccount, eq(adminAccount.id, aiPrompt.updatedBy))
    .where(and(eq(aiPrompt.locale, locale), eq(aiPrompt.key, key)))
    .limit(1);

  const revisions = await db
    .select({
      id: aiPromptRevision.id,
      content: aiPromptRevision.content,
      adminLoginId: adminAccount.loginId,
      createdAt: aiPromptRevision.createdAt,
    })
    .from(aiPromptRevision)
    .leftJoin(adminAccount, eq(adminAccount.id, aiPromptRevision.adminId))
    .where(
      and(eq(aiPromptRevision.locale, locale), eq(aiPromptRevision.key, key)),
    )
    .orderBy(desc(aiPromptRevision.createdAt))
    .limit(REVISION_LIMIT);

  const { status, missing } = derivePromptStatus(
    override?.content ?? null,
    base.requiredMarkers,
  );

  return {
    defaultContent: base.content,
    requiredMarkers: base.requiredMarkers,
    overrideContent: override?.content ?? null,
    status,
    missingMarkers: missing,
    editorLoginId: override?.editorLoginId ?? null,
    updatedAt: override?.updatedAt ?? null,
    revisions,
  };
};
