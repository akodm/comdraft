import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 브라우저용 Supabase 클라이언트 (Realtime Broadcast 수신 전용)
 * - 공개 URL 과 publishable 키만 사용 (인증 세션은 Better Auth 가 관리하므로 저장하지 않음)
 * - 환경 변수가 없으면 null: 화면은 주기적인 상태 조회로만 진행 상황을 확인
 */
let browserClient: SupabaseClient | null | undefined;

export const getBrowserSupabase = () => {
  if (browserClient !== undefined) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  browserClient =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  return browserClient;
};
