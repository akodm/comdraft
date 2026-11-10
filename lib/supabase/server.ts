import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * 서버용 Supabase 클라이언트 (Storage 관리 전용, secret 키 사용)
 * - secret 키는 이 모듈에서만 읽고 값을 출력하지 않음
 * - 인증 세션은 저장하지 않음 (Better Auth 가 관리)
 */
export const getSupabaseUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 환경 변수가 필요합니다.');
  }

  return url;
};

let serverClient: SupabaseClient | undefined;

export const getServerSupabase = (): SupabaseClient => {
  if (serverClient) {
    return serverClient;
  }

  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!key) {
    throw new Error('SUPABASE_SECRET_KEY 환경 변수가 필요합니다.');
  }

  serverClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return serverClient;
};
