import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { ADMIN_TITLE_CLASS } from '@/components/admin/admin-styles';
import AdminTable from '@/components/admin/admin-table';
import ConfirmActionButton from '@/components/admin/confirm-action-button';
import { banPost, deletePost, unbanPost } from '@/lib/actions/admin/posts';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import { getPostDetail } from '@/lib/admin/post-queries';
import { canPerform } from '@/lib/admin/roles';
import { summarizeActionDetail } from '@/lib/admin/stats';
import { localizePath } from '@/lib/i18n/config';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { getPostPath } from '@/lib/posts/post-path';
import LocalizedLink from '@/components/shared/localized-link';

interface AdminPostDetailPageProps {
  params: Promise<{ postId: string }>;
}

const SECTION_TITLE_CLASS =
  'text-[15px] leading-[1.4] font-bold tracking-[-0.3px] text-ink';

const formatDateTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);

const InfoRow = ({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
    <dt className="w-32 shrink-0 text-[12px] text-ink-muted">{label}</dt>
    <dd className="min-w-0 text-[13px] break-all text-ink">{children}</dd>
  </div>
);

// 어드민 게시글 상세: 정보, 조치 버튼, 관련 조치 기록
export default async function AdminPostDetailPage({
  params,
}: AdminPostDetailPageProps) {
  const i18n = await initLingui();
  const admin = await requireAdmin('view');
  const { postId } = await params;
  const detail = await getPostDetail(postId);

  if (!detail) {
    notFound();
  }

  const locale = await getLocale();
  const { post, author } = detail;
  const listPath = adminPath(locale, requireAdminKey(), 'posts');
  const canModerate = canPerform(admin.role, 'post.ban');
  const canDelete = canPerform(admin.role, 'post.delete');
  const hidden = { postId: post.id };
  // 서비스 화면은 전체 페이지로 열어 어드민 주소가 서비스 분석에 남지 않게 함
  const publicHref = localizePath(post.locale, getPostPath(post));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className={ADMIN_TITLE_CLASS}>{post.title || '-'}</h1>
        {post.bannedAt ? (
          <span className="border border-danger px-1.5 py-0.5 text-[11px] text-danger">
            <Trans>밴</Trans>
          </span>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>기본 정보</Trans>
        </h2>
        <dl className="flex flex-col gap-2 border border-line bg-white p-4">
          <InfoRow label="ID">{post.id}</InfoRow>
          <InfoRow label={<Trans>작성자</Trans>}>
            <LocalizedLink
              href={adminPath(locale, requireAdminKey(), `users/${author.id}`)}
              className="underline-offset-2 hover:underline"
            >
              {author.githubLogin
                ? `${author.githubLogin} (${author.email})`
                : author.email}
            </LocalizedLink>
          </InfoRow>
          <InfoRow label={<Trans>공개 범위</Trans>}>
            {post.visibility === 'public' ? (
              <Trans>전체 공개</Trans>
            ) : (
              <Trans>일부 공개</Trans>
            )}
          </InfoRow>
          <InfoRow label={<Trans>언어</Trans>}>{post.locale}</InfoRow>
          <InfoRow label={<Trans>게시일</Trans>}>
            {formatDateTime(post.publishedAt, locale)}
          </InfoRow>
          <InfoRow label={<Trans>마지막 게시</Trans>}>
            {formatDateTime(post.updatedAt, locale)}
          </InfoRow>
          <InfoRow label={<Trans>조회 수</Trans>}>{detail.viewCount}</InfoRow>
          {post.bannedAt ? (
            <>
              <InfoRow label={<Trans>밴 시각</Trans>}>
                {formatDateTime(post.bannedAt, locale)}
              </InfoRow>
              <InfoRow label={<Trans>밴 사유</Trans>}>
                {post.banReason ?? '-'}
              </InfoRow>
            </>
          ) : null}
          <InfoRow label={<Trans>공개 화면</Trans>}>
            <a
              href={publicHref}
              target="_blank"
              rel="noreferrer noopener"
              className="underline-offset-2 hover:underline"
            >
              {publicHref}
            </a>
          </InfoRow>
        </dl>
      </section>

      {canModerate ? (
        <section className="flex flex-col gap-3">
          <h2 className={SECTION_TITLE_CLASS}>
            <Trans>조치</Trans>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {post.bannedAt ? (
              <ConfirmActionButton
                action={unbanPost}
                label={i18n._(msg`밴 해제`)}
                confirmLabel={i18n._(msg`해제`)}
                hidden={hidden}
              />
            ) : (
              <ConfirmActionButton
                action={banPost}
                label={i18n._(msg`밴`)}
                confirmLabel={i18n._(msg`밴`)}
                description={
                  <Trans>
                    목록과 사이트맵에서 빠지고 상세에는 안내만 보여요.
                  </Trans>
                }
                danger
                reasonField
                hidden={hidden}
              />
            )}
            {canDelete ? (
              <ConfirmActionButton
                action={deletePost}
                label={i18n._(msg`게시글 삭제`)}
                confirmLabel={i18n._(msg`삭제`)}
                description={
                  <Trans>
                    게시글이 지워지고 원래 초안은 작성 중 상태로 돌아가요.
                    되돌릴 수 없어요.
                  </Trans>
                }
                danger
                hidden={hidden}
              />
            ) : null}
          </div>
          <LocalizedLink
            href={listPath}
            className="text-[12px] text-ink-muted underline-offset-2 hover:underline"
          >
            <Trans>목록으로</Trans>
          </LocalizedLink>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE_CLASS}>
          <Trans>관련 조치 기록</Trans>
        </h2>
        <AdminTable
          columns={[
            { key: 'time', label: <Trans>시각</Trans> },
            { key: 'admin', label: <Trans>어드민</Trans> },
            { key: 'action', label: <Trans>조치</Trans> },
            { key: 'summary', label: <Trans>요약</Trans> },
          ]}
          rows={detail.actions.map((action) => ({
            id: action.id,
            cells: {
              time: formatDateTime(action.createdAt, locale),
              admin: action.loginId ?? <Trans>삭제된 어드민</Trans>,
              action: action.action,
              summary: summarizeActionDetail(action.detail) || '-',
            },
          }))}
          empty={<Trans>조치 기록이 없어요</Trans>}
        />
      </section>
    </div>
  );
}
