import type { LocalizedLegalDocument } from '@/lib/legal/types';

/**
 * 개인정보처리방침
 * - 실제 수집·저장·전송 항목과 맞춰 둠: 코드를 바꾸면 이 문서도 함께 확인
 *   (GitHub 로그인 정보, 저장소 연동 정보, 작성 콘텐츠, 세션의 IP·브라우저 정보, 조회 기록, 쿠키,
 *    AI 작성 때 Anthropic 으로 보내는 내용, 인프라 위탁)
 */
export const PRIVACY_POLICY: LocalizedLegalDocument = {
  ko: {
    title: '개인정보처리방침',
    effectiveDate: '2026-11-14',
    intro:
      'comdraft(이하 "서비스")는 이용자의 개인정보를 소중히 다루며, 서비스 제공에 필요한 최소한의 정보만 처리합니다. 이 방침은 서비스가 어떤 정보를 어떤 목적으로 처리하고, 누구에게 전달하며, 어떻게 보호하는지 설명합니다.',
    sections: [
      {
        heading: '1. 처리하는 개인정보 항목',
        paragraphs: ['서비스는 다음 정보를 처리합니다.'],
        items: [
          'GitHub 로그인: GitHub 계정 식별 번호, GitHub 아이디, 이름, 이메일 주소, 프로필 이미지 주소, GitHub 인증 토큰(암호화하여 저장)',
          '저장소 연동: GitHub App 설치 정보, 연동한 저장소의 이름·소유자·공개 여부·브랜치',
          '서비스 이용 중 작성한 내용: 초안 작성 요청 내용, 선택한 커밋의 식별자(SHA), 참고 링크, 초안·게시글 본문과 기술 태그, 업로드한 이미지, AI 사용량 기록',
          '자동으로 생성되는 정보: 로그인 세션의 IP 주소와 브라우저 정보(User-Agent), 게시글 조회 기록(로그인 사용자 식별자 또는 무작위 방문자 식별자), 쿠키',
        ],
      },
      {
        heading: '2. 저장하지 않는 정보',
        items: [
          'GitHub 비밀번호는 받지 않습니다. 로그인은 GitHub 인증으로만 이루어집니다.',
          '저장소의 코드 원문은 서비스에 저장하지 않습니다. AI 초안을 작성할 때에만 GitHub 에서 조회하여 AI 에 전달합니다.',
          '다만 이용자가 작성하거나 게시한 초안·게시글에 포함된 코드 조각은 그 초안·게시글의 내용으로 저장됩니다.',
        ],
      },
      {
        heading: '3. 개인정보의 이용 목적',
        items: [
          '회원 식별과 로그인 유지',
          '저장소 연동과 커밋 내역 조회',
          'AI 를 이용한 기술 블로그 초안 작성과 사용량 관리',
          '게시글 게시와 작성자 표시(이름, 프로필 이미지, GitHub 프로필 링크)',
          '조회 수 집계 등 서비스 운영과 개선, 부정 이용 방지',
        ],
      },
      {
        heading: '4. 제3자 AI 서비스로의 전송(국외 이전)',
        paragraphs: [
          '서비스는 AI 초안 작성을 위해 다음과 같이 정보를 국외의 AI 서비스 제공자에게 전송합니다. 이용자가 초안 작성을 요청할 때마다 네트워크를 통해 전송됩니다.',
        ],
        items: [
          '받는 자: Anthropic, PBC (미국) — Claude API',
          '전송 항목: 초안 작성 요청 내용, 선택한 커밋의 메시지와 코드 변경 내용, 참고 링크의 본문, 빈칸 채우기 답변과 작성 중인 초안 내용',
          '전송 목적: AI 초안 작성과 다듬기',
          '보유 기간: Anthropic 의 데이터 처리 정책에 따름',
          '이름·이메일 등 계정 정보는 AI 에 전송하지 않습니다.',
          '초안 작성 기능을 사용하지 않으면 AI 로 정보가 전송되지 않습니다.',
        ],
      },
      {
        heading: '5. 개인정보 처리의 위탁',
        paragraphs: [
          '서비스는 운영을 위해 다음 업체의 인프라를 이용하며, 각 업체는 서비스 제공에 필요한 범위에서만 정보를 처리합니다.',
        ],
        items: [
          'Vercel Inc. (미국): 웹 서비스 호스팅(서버는 서울 리전), 쿠키 없는 방문 통계와 성능 측정',
          'Supabase Inc. (미국, 데이터는 서울 리전): 데이터베이스와 업로드 이미지 저장',
          'Amazon Web Services, Inc. (미국, 서울 리전): AI 초안 작성 서버 실행',
          'GitHub, Inc. (미국): 로그인 인증, 저장소와 커밋 정보 조회',
        ],
      },
      {
        heading: '6. 보유 및 이용 기간',
        items: [
          '개인정보는 회원 탈퇴 시까지 보유하며, 탈퇴 또는 삭제 요청을 받으면 지체 없이 파기합니다.',
          '회원 탈퇴는 아래 문의처 이메일로 요청할 수 있습니다.',
          '초안을 삭제하거나 게시를 취소하면 해당 콘텐츠와 게시글의 조회 기록이 함께 삭제되며, 사용하지 않는 업로드 이미지는 정리됩니다.',
          '로그인 세션은 마지막 이용 후 7일이 지나면 만료됩니다.',
        ],
      },
      {
        heading: '7. 개인정보의 파기',
        paragraphs: [
          '보유 기간이 끝났거나 처리 목적이 달성된 개인정보는 복구할 수 없는 방법으로 삭제합니다.',
        ],
      },
      {
        heading: '8. 이용자의 권리',
        items: [
          '이용자는 언제든지 자신의 개인정보에 대한 열람, 정정, 삭제, 처리 정지를 요청할 수 있으며, 서비스는 지체 없이 조치합니다.',
          '요청은 아래 문의처 이메일로 할 수 있습니다.',
          'GitHub 설정의 Applications 메뉴에서 서비스의 GitHub App 권한을 언제든지 철회할 수 있습니다.',
        ],
      },
      {
        heading: '9. 쿠키 사용',
        paragraphs: [
          '서비스는 다음 목적의 쿠키만 사용하며, 광고 목적의 쿠키는 사용하지 않습니다. 브라우저 설정으로 쿠키를 거부할 수 있으나, 이 경우 로그인 등 일부 기능을 이용할 수 없습니다.',
        ],
        items: [
          '로그인 세션 쿠키: 로그인 상태 유지',
          '언어 설정 쿠키: 마지막으로 방문한 언어 기억',
          '방문자 식별 쿠키: 게시글 조회 수를 중복 없이 세기 위한 무작위 값 (1년 보관, 개인을 식별하는 정보 없음)',
          'GitHub 연동 확인 쿠키: 저장소 연동 과정의 위조 요청 방지 (연동이 끝나면 삭제)',
        ],
      },
      {
        heading: '10. 개인정보의 안전성 확보 조치',
        items: [
          '모든 통신은 HTTPS 로 암호화합니다.',
          'GitHub 인증 토큰은 암호화하여 저장합니다.',
          '데이터베이스와 서버 접근 권한을 필요한 범위로 제한합니다.',
        ],
      },
      {
        heading: '11. 방침의 변경',
        paragraphs: [
          '이 방침이 변경되면 시행일과 함께 이 페이지에 게시합니다.',
        ],
      },
      {
        heading: '12. 문의처',
        paragraphs: [
          '개인정보 처리에 관한 문의, 열람·정정·삭제 요청, 회원 탈퇴 요청은 서비스 운영자에게 이메일로 보내 주세요.',
        ],
        contact: true,
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    effectiveDate: '2026-11-14',
    intro:
      'comdraft (the "Service") values your privacy and processes only the minimum information needed to provide the Service. This policy explains what information we process, why, who we share it with, and how we protect it.',
    sections: [
      {
        heading: '1. Information we process',
        paragraphs: ['The Service processes the following information.'],
        items: [
          'GitHub sign-in: GitHub account ID number, GitHub username, name, email address, profile image URL, and GitHub authentication tokens (stored encrypted)',
          'Repository connection: GitHub App installation details and the name, owner, visibility, and branch of connected repositories',
          'Content you create: draft requests, selected commit identifiers (SHAs), reference links, draft and post bodies and technology tags, uploaded images, and AI usage records',
          'Automatically generated information: IP address and browser information (User-Agent) of sign-in sessions, post view records (a signed-in user identifier or a random visitor identifier), and cookies',
        ],
      },
      {
        heading: '2. Information we do not store',
        items: [
          'We never receive your GitHub password. Sign-in happens only through GitHub authentication.',
          'We do not store the source code of your repositories. It is fetched from GitHub only when an AI draft is written and passed to the AI.',
          'However, code snippets included in drafts or posts you write or publish are stored as part of that content.',
        ],
      },
      {
        heading: '3. How we use information',
        items: [
          'Identifying members and keeping you signed in',
          'Connecting repositories and looking up commit history',
          'Writing tech blog drafts with AI and managing usage',
          'Publishing posts and showing their author (name, profile image, GitHub profile link)',
          'Operating and improving the Service, including view counts, and preventing abuse',
        ],
      },
      {
        heading:
          '4. Transfer to a third-party AI service (international transfer)',
        paragraphs: [
          'To write AI drafts, the Service sends information to an AI service provider outside Korea as described below. It is sent over the network each time you request a draft.',
        ],
        items: [
          'Recipient: Anthropic, PBC (United States) — Claude API',
          'Items sent: your draft request, the messages and code changes of the selected commits, the body of reference links, and your answers for blanks together with the draft being written',
          'Purpose: writing and refining AI drafts',
          "Retention: according to Anthropic's data processing policy",
          'Account information such as your name or email is not sent to the AI.',
          'If you do not use draft writing, no information is sent to the AI.',
        ],
      },
      {
        heading: '5. Processors',
        paragraphs: [
          'The Service runs on the following providers, each of which processes information only as needed to provide the Service.',
        ],
        items: [
          'Vercel Inc. (United States): web hosting (servers in the Seoul region), cookieless visit analytics and performance monitoring',
          'Supabase Inc. (United States, data in the Seoul region): database and uploaded image storage',
          'Amazon Web Services, Inc. (United States, Seoul region): running the AI draft server',
          'GitHub, Inc. (United States): sign-in authentication and repository and commit lookups',
        ],
      },
      {
        heading: '6. Retention',
        items: [
          'We keep personal information until you leave the Service and delete it without delay when you leave or ask us to delete it.',
          'You can ask to leave the Service by email to the contact below.',
          'Deleting a draft or unpublishing a post deletes that content and the post’s view records, and unused uploaded images are cleaned up.',
          'Sign-in sessions expire 7 days after your last activity.',
        ],
      },
      {
        heading: '7. Deletion',
        paragraphs: [
          'Personal information whose retention period has ended or whose purpose has been fulfilled is deleted so that it cannot be recovered.',
        ],
      },
      {
        heading: '8. Your rights',
        items: [
          'You may ask at any time to access, correct, delete, or stop the processing of your personal information, and we will act on it without delay.',
          'Send requests by email to the contact below.',
          "You can revoke the Service's GitHub App access at any time from the Applications menu in your GitHub settings.",
        ],
      },
      {
        heading: '9. Cookies',
        paragraphs: [
          'The Service uses only the cookies below and no advertising cookies. You can refuse cookies in your browser settings, but some features such as sign-in will not work.',
        ],
        items: [
          'Session cookie: keeps you signed in',
          'Language cookie: remembers the language you last visited',
          'Visitor cookie: a random value used to count post views without duplicates (kept for 1 year, contains no personally identifying information)',
          'GitHub connection cookie: prevents forged requests while connecting a repository (deleted when the connection finishes)',
        ],
      },
      {
        heading: '10. Security measures',
        items: [
          'All traffic is encrypted with HTTPS.',
          'GitHub authentication tokens are stored encrypted.',
          'Access to the database and servers is limited to what is needed.',
        ],
      },
      {
        heading: '11. Changes to this policy',
        paragraphs: [
          'If this policy changes, we will post it on this page with its effective date.',
        ],
      },
      {
        heading: '12. Contact',
        paragraphs: [
          'For questions about how your information is handled, requests to access, correct, or delete it, or to leave the Service, email the operator.',
        ],
        contact: true,
      },
    ],
  },
};
