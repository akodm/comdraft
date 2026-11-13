import 'server-only';
import { betterAuth } from 'better-auth/minimal';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

const NOREPLY_EMAIL_SUFFIX = '@users.noreply.github.com';

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
      // Better Auth 는 계정 조회 전에 이메일 유무를 검사하므로, 대체 주소가 없으면 기존 사용자의 재로그인까지 막힘
      // → 이메일을 못 받으면 대체 주소를 넘기고, 신규 가입은 아래 user.create.before 훅에서 차단
      mapProfileToUser: (profile) => ({
        email:
          profile.email ??
          `${profile.id}+${profile.login}${NOREPLY_EMAIL_SUFFIX}`,
        // 게시글 작성자 프로필 링크용 (가입 때 저장, 기존 사용자는 scripts/backfill-github-login.mjs)
        githubLogin: profile.login,
      }),
    },
  },
  user: {
    additionalFields: {
      // 사용량 등급 (quota_plan.role), 클라이언트에서 변경 불가
      role: {
        type: 'string',
        required: false,
        input: false,
      },
      // 세션 user 객체에 포함시키기 위해 등록
      // input: false → 클라이언트(updateUser 등)에서 임의로 설정 불가, 온보딩 서버 액션에서만 기록
      onboardedAt: {
        type: 'date',
        required: false,
        input: false,
      },
      // GitHub 아이디 (클라이언트에서 변경 불가, GitHub 프로필에서만 받음)
      githubLogin: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // GitHub 에서 검증된 실제 이메일을 받은 경우에만 회원가입 허용
        before: async (user) => {
          if (user.email.toLowerCase().endsWith(NOREPLY_EMAIL_SUFFIX)) {
            throw new APIError('FORBIDDEN', {
              code: 'email_not_found',
              message: 'GitHub 이메일 정보를 받지 못해 가입할 수 없습니다.',
            });
          }

          // emailVerified 는 /user/emails 응답 기준
          // → 앱 권한이 없거나, API 호출이 실패했거나, GitHub 에서 미인증인 이메일이면 false
          if (!user.emailVerified) {
            throw new APIError('FORBIDDEN', {
              code: 'email_not_verified',
              message: 'GitHub 에서 인증된 이메일을 확인할 수 없습니다.',
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
  // OAuth state 를 복원하기 전에 실패한 경우에도 기본 오류 페이지 대신 로그인 페이지에서 안내
  onAPIError: {
    errorURL: '/sign-in',
  },
  advanced: {
    cookiePrefix: 'comdraft',
    // 프로덕션에서는 기본적으로 Secure 쿠키 사용, HttpOnly / SameSite=Lax 는 Better Auth 기본값
  },
  // Server Action 등에서 auth.api 호출 시 Set-Cookie 를 Next.js 쿠키로 반영 (반드시 마지막 플러그인)
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
