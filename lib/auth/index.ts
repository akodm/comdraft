import 'server-only';
import { betterAuth } from 'better-auth/minimal';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

const requireEnv = (key: string) => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} 환경 변수가 설정되지 않았습니다.`);
  }

  return value;
};

/**
 * GitHub 회원가입/로그인 전용 인증 설정
 *
 * - GitHub App 의 Client ID/Secret 으로 "사용자 인증(OAuth)" 만 수행
 *   → 이 단계에서는 저장소 권한을 요청하지 않음 (GitHub App 은 scope 를 무시하고 앱 권한을 따름)
 *   → 저장소 접근은 이후 GitHub App 설치(installation) 플로우에서 별도로 획득
 * - 세션은 DB 저장형 세션을 사용 (JWT 미사용)
 *   → 쿠키에는 서명된 불투명 토큰만 담기고, 매 요청마다 DB 에서 검증
 *   → 서버에서 세션 행을 지우면 즉시 무효화(로그아웃/강제 만료) 가능
 */
export const auth = betterAuth({
  appName: 'comdraft',
  baseURL: requireEnv('BETTER_AUTH_URL'),
  secret: requireEnv('BETTER_AUTH_SECRET'),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  // 이메일/비밀번호 가입은 사용하지 않음 (GitHub 로그인만 허용)
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    github: {
      clientId: requireEnv('GITHUB_CLIENT_ID'),
      clientSecret: requireEnv('GITHUB_SECRET_KEY'),
      redirectURI: process.env.REDIRECT_URL,
      // 이메일 대체값을 두지 않음
      // → 이메일 권한(/user/emails) 미동의로 이메일을 못 받으면 Better Auth 가 email_not_found 로 가입 차단
    },
  },
  user: {
    additionalFields: {
      // 세션 user 객체에 포함시키기 위해 등록
      // input: false → 클라이언트(updateUser 등)에서 임의로 설정 불가, 온보딩 서버 액션에서만 기록
      onboardedAt: {
        type: 'date',
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // GitHub 에서 검증된 실제 이메일을 받은 경우에만 회원가입 허용
        // (emailVerified 는 /user/emails 응답 기준이라, 이메일 권한 미동의 시 공개 프로필 이메일만 있어도 false)
        before: async (user) => {
          if (
            !user.emailVerified ||
            user.email.toLowerCase().endsWith('@users.noreply.github.com')
          ) {
            throw new APIError('FORBIDDEN', {
              code: 'email_not_verified',
              message: 'GitHub 이메일 제공에 동의해야 가입할 수 있습니다.',
            });
          }
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7일
    updateAge: 60 * 60 * 24, // 하루 이상 지난 세션을 사용하면 만료일 연장
    // 쿠키 캐시를 끄면 매 요청 DB 조회가 발생하지만, 세션 폐기가 즉시 반영됨
    cookieCache: {
      enabled: false,
    },
  },
  rateLimit: {
    // 기본 메모리 저장소는 서버리스(Vercel) 인스턴스마다 따로 카운트되어 효과가 없으므로 DB 에 저장
    // enabled 는 기본값(프로덕션에서만 활성화) 유지
    storage: 'database',
  },
  account: {
    // DB 에 저장되는 GitHub 사용자 액세스/리프레시 토큰 암호화
    encryptOAuthTokens: true,
    // GitHub 외 다른 로그인 수단이 없으므로 계정 자동 연결 비활성화
    accountLinking: {
      enabled: false,
    },
  },
  advanced: {
    cookiePrefix: 'comdraft',
    // 프로덕션에서는 기본적으로 Secure 쿠키 사용, HttpOnly / SameSite=Lax 는 Better Auth 기본값
  },
  // Server Action 등에서 auth.api 호출 시 Set-Cookie 를 Next.js 쿠키로 반영 (반드시 마지막 플러그인)
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
