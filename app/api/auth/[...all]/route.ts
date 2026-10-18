import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

// GitHub 콜백(REDIRECT_URL: /api/auth/callback/github) 포함 Better Auth 엔드포인트 일괄 처리
export const { GET, POST } = toNextJsHandler(auth);
