import 'server-only';
import {
  GENERATION_BROADCAST_EVENT,
  type GenerationBroadcastPayload,
} from '@/lib/generation/contract';

/**
 * 작업 진행 신호를 Supabase Realtime Broadcast 로 전송 (REST API)
 * - 신호만 보내고 내용(결과, 요청 문구)은 싣지 않음: 받는 쪽은 상태 조회 액션으로 다시 읽음
 * - 채널 이름(draft_prompt.channel)은 추측할 수 없는 UUID 라 공개 채널로 전송
 * - 전송 실패는 무시 (클라이언트가 주기적으로 상태를 다시 조회)
 */
export const sendGenerationSignal = async (
  channel: string,
  payload: GenerationBroadcastPayload,
) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return false;
  }

  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            topic: channel,
            event: GENERATION_BROADCAST_EVENT,
            payload,
            private: false,
          },
        ],
      }),
      cache: 'no-store',
    });

    return response.ok;
  } catch {
    return false;
  }
};
