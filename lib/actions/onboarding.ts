'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { requireOnboardingSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

// 온보딩 완료 처리 후 대시보드로 이동
// 약관 동의/추가 입력 등을 받는다면 formData 검증 후 같은 update 에서 함께 저장
export async function completeOnboarding() {
  const { user: sessionUser } = await requireOnboardingSession();

  await db
    .update(user)
    .set({ onboardedAt: new Date() })
    .where(and(eq(user.id, sessionUser.id), isNull(user.onboardedAt)));

  redirect('/dashboard');
}
