import { notFound } from 'next/navigation';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import AdminTable from '@/components/admin/admin-table';
import ConfirmActionButton from '@/components/admin/confirm-action-button';
import PromptEditorForm from '@/components/admin/prompt-editor-form';
import LocalizedLink from '@/components/shared/localized-link';
import {
  resetPromptOverride,
  restorePromptRevision,
} from '@/lib/actions/admin/ai-prompts';
import { getPromptEditor } from '@/lib/admin/ai-prompt-queries';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import { canPerform } from '@/lib/admin/roles';
import { getLocale, initLingui } from '@/lib/i18n/server';

interface AdminAiPromptEditPageProps {
  params: Promise<{ locale: string; key: string }>;
}

const SECTION_TITLE_CLASS =
  'text-[15px] leading-[1.4] font-bold tracking-[-0.3px] text-ink';

const TEXT_BOX_CLASS =
  'min-h-40 border border-line bg-white p-4 font-mono text-[13px] leading-[1.6] break-words whitespace-pre-wrap text-ink';

const formatDateTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);

// 깨진 인코딩은 그대로 두어 기본값 행을 못 찾고 404 가 되게 함
const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// 어드민 AI 프롬프트 편집: 기본 문장(읽기 전용)과 수정 문장을 나란히, 이력과 되돌리기
export default async function AdminAiPromptEditPage({
  params,
}: AdminAiPromptEditPageProps) {
  const i18n = await initLingui();
  const admin = await requireAdmin('view');
  const { locale: promptLocale, key: rawKey } = await params;
  // 키에 점이 있어 주소에서는 인코딩돼 들어옴
  const promptKey = safeDecode(rawKey);
  const data = await getPromptEditor(promptLocale, promptKey);

  if (!data) {
    notFound();
  }

  const locale = await getLocale();
  const canEdit = canPerform(admin.role, 'prompt.edit');
  const listPath = adminPath(locale, requireAdminKey(), 'ai-prompts');

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <LocalizedLink
          href={listPath}
          className="text-[12px] text-ink-muted underline-offset-2 hover:underline"
        >
          <Trans>AI 프롬프트 목록</Trans>
        </LocalizedLink>
        <h1 className={`${ADMIN_TITLE_CLASS} break-all`}>
          {promptLocale} / {promptKey}
        </h1>
        <p className="text-[12px] text-ink-faint">
          {data.overrideContent !== null ? (
            <Trans>
              수정됨 · {data.editorLoginId ?? '-'} ·{' '}
              {data.updatedAt ? formatDateTime(data.updatedAt, locale) : '-'}
            </Trans>
          ) : (
            <Trans>기본값 사용 중</Trans>
          )}
        </p>
        {promptKey.endsWith('.system') ? (
          <p className="text-[12px] leading-[1.6] text-ink-muted">
            <Trans>
              system 문장은 저장할 때의 옵션 표 내용을 그대로 담아요. 말투·유형
              문구를 나중에 고쳐도 이 문장 속 표는 바뀌지 않아요.
            </Trans>
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>꼭 들어 있어야 하는 문자열</Trans>
        </h2>
        {data.requiredMarkers.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {data.requiredMarkers.map((marker) => (
              <li key={marker}>
                <code className="border border-line bg-white px-1.5 py-0.5 text-[12px] break-all text-ink">
                  {marker}
                </code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-faint">
            <Trans>없어요</Trans>
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className={SECTION_TITLE_CLASS}>
            <Trans>기본 문장</Trans>
          </h2>
          <div className={TEXT_BOX_CLASS}>{data.defaultContent}</div>
        </section>
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className={SECTION_TITLE_CLASS}>
            <Trans>수정 문장</Trans>
          </h2>
          {canEdit ? (
            <PromptEditorForm
              // 저장·복원으로 값이 바뀌면 입력 칸을 새 값으로 다시 그림
              key={data.overrideContent ?? 'default'}
              locale={promptLocale}
              promptKey={promptKey}
              initialContent={data.overrideContent ?? data.defaultContent}
            />
          ) : (
            <div className={TEXT_BOX_CLASS}>
              {data.overrideContent ?? data.defaultContent}
            </div>
          )}
          {canEdit && data.overrideContent !== null ? (
            <div>
              <ConfirmActionButton
                action={resetPromptOverride}
                label={i18n._(msg`기본값으로 되돌리기`)}
                confirmLabel={i18n._(msg`되돌리기`)}
                description={
                  <Trans>
                    수정본을 지우고 기본 문장을 써요. 지금 수정본은 이력에
                    남아요.
                  </Trans>
                }
                danger
                hidden={{ locale: promptLocale, key: promptKey }}
              />
            </div>
          ) : null}
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>수정 이력</Trans>
        </h2>
        <AdminTable
          columns={[
            { key: 'time', label: <Trans>시각</Trans> },
            { key: 'admin', label: <Trans>어드민</Trans> },
            { key: 'content', label: <Trans>이전 내용</Trans> },
            ...(canEdit
              ? [{ key: 'restore', label: <Trans>다시 적용</Trans> }]
              : []),
          ]}
          rows={data.revisions.map((revision) => ({
            id: revision.id,
            cells: {
              time: formatDateTime(revision.createdAt, locale),
              admin: revision.adminLoginId ?? <Trans>삭제된 어드민</Trans>,
              content:
                revision.content === null ? (
                  <Trans>기본값</Trans>
                ) : (
                  <span className="line-clamp-3 font-mono text-[12px] break-all whitespace-pre-wrap">
                    {revision.content}
                  </span>
                ),
              restore: (
                <ConfirmActionButton
                  action={restorePromptRevision}
                  label={i18n._(msg`다시 적용`)}
                  confirmLabel={i18n._(msg`적용`)}
                  description={
                    <Trans>
                      이 내용을 수정본으로 저장해요. 지금 수정본은 이력에
                      남아요.
                    </Trans>
                  }
                  hidden={{ revisionId: revision.id }}
                />
              ),
            },
          }))}
          empty={<Trans>수정 이력이 없어요</Trans>}
        />
      </section>
    </div>
  );
}
