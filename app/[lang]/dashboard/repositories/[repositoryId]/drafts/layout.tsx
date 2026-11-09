import { notFound } from 'next/navigation';
import StudioShell from '@/components/studio/studio-shell';
import { requireSession } from '@/lib/auth/session';
import { initLingui } from '@/lib/i18n/server';
import { getStudioRepository, listStudioDrafts } from '@/lib/studio/queries';

interface StudioLayoutProps {
  children: React.ReactNode;
  params: Promise<{ repositoryId: string }>;
}

/**
 * 초안 작성 스튜디오 (저장소별)
 * - 로그인 + 온보딩 완료 사용자만, 본인이 연동한 저장소만 열 수 있음 (아니면 404)
 * - 사이드바(초안 목록, 커밋 내역)는 레이아웃에 두어 초안을 옮겨 다녀도 유지
 */
export default async function StudioLayout({
  children,
  params,
}: StudioLayoutProps) {
  await initLingui();
  const { user } = await requireSession();
  const { repositoryId } = await params;
  const repository = await getStudioRepository(user.id, repositoryId);

  if (!repository) {
    notFound();
  }

  const drafts = await listStudioDrafts(user.id, repository.id);

  return (
    <StudioShell repository={repository} drafts={drafts} userName={user.name}>
      {children}
    </StudioShell>
  );
}
