import { createAuthClient } from 'better-auth/react';

// baseURL 을 생략하면 현재 origin 의 /api/auth 를 사용
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
