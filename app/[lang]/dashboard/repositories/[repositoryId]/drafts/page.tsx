import { notFound } from 'next/navigation';
import StudioWorkspace from '@/components/studio/studio-workspace';
import { requireSession } from '@/lib/auth/session';
import { initLingui } from '@/lib/i18n/server';
import { getStudioRepository } from '@/lib/studio/queries';

interface NewDraftPageProps {
  params: Promise<{ repositoryId: string }>;
}

// 새 초안: 커밋을 선택하고 작성 요청을 보내면 초안이 만들어짐
export default async function NewDraftPage({ params }: NewDraftPageProps) {
  await initLingui();
  // 레이아웃과 별개로 페이지에서도 접근 권한 확인 (레이아웃과 페이지는 함께 렌더링됨)
  const { user } = await requireSession();
  const { repositoryId } = await params;

  if (!(await getStudioRepository(user.id, repositoryId))) {
    notFound();
  }

  return <StudioWorkspace draft={null} />;
}
