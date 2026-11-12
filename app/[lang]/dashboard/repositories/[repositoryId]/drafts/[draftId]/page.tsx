import { notFound } from 'next/navigation';
import StudioWorkspace from '@/components/studio/studio-workspace';
import { requireSession } from '@/lib/auth/session';
import { getAllowedModels } from '@/lib/generation/models';
import { initLingui } from '@/lib/i18n/server';
import { getStudioDraft } from '@/lib/studio/queries';

interface DraftPageProps {
  params: Promise<{ repositoryId: string; draftId: string }>;
}

// 초안 편집: 본인이 해당 저장소에 만든 초안만 열 수 있음 (아니면 404)
export default async function DraftPage({ params }: DraftPageProps) {
  await initLingui();
  const { user } = await requireSession();
  const { repositoryId, draftId } = await params;
  const draft = await getStudioDraft(user.id, user.role, repositoryId, draftId);

  if (!draft) {
    notFound();
  }

  // 초안이 바뀌면 편집기와 옵션 상태를 새로 시작
  return (
    <StudioWorkspace
      key={draft.id}
      draft={draft}
      allowedModels={getAllowedModels(user.role)}
    />
  );
}
