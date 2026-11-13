import type { LocalizedLegalDocument } from '@/lib/legal/types';

/**
 * 이용약관 (기본 사항만, 연령 제한 없음)
 */
export const TERMS_OF_SERVICE: LocalizedLegalDocument = {
  ko: {
    title: '이용약관',
    effectiveDate: '2026-11-14',
    intro:
      '이 약관은 comdraft(이하 "서비스")를 이용하는 데 필요한 조건과 이용자와 서비스 운영자의 권리·의무를 정합니다. 서비스를 이용하면 이 약관에 동의한 것으로 봅니다.',
    sections: [
      {
        heading: '1. 서비스 내용',
        paragraphs: ['서비스는 다음 기능을 제공합니다.'],
        items: [
          'GitHub 계정으로 로그인하고 저장소를 연동하여 커밋 내역을 조회하고 선택하는 기능',
          '선택한 커밋을 바탕으로 AI 가 기술 블로그 초안을 작성하는 기능',
          '초안을 수정하는 에디터와 서비스 내 게시 기능',
          '초안을 HTML·Markdown 파일로 내보내 다른 블로그에 공유하는 기능',
        ],
      },
      {
        heading: '2. 계정',
        items: [
          '서비스는 GitHub 계정으로만 가입하고 로그인할 수 있습니다.',
          '이용자는 자신의 GitHub 계정을 안전하게 관리할 책임이 있습니다.',
          '서비스는 이용자가 연동한 저장소에 대해 GitHub App 으로 허용된 범위에서만 접근합니다.',
        ],
      },
      {
        heading: '3. AI 사용량',
        items: [
          'AI 초안 작성에는 계정 등급별 사용량 한도가 있으며, 한도는 정해진 주기마다 초기화됩니다.',
          '서비스는 운영 상황에 따라 한도와 사용할 수 있는 AI 모델을 변경할 수 있습니다.',
        ],
      },
      {
        heading: '4. AI 생성 결과',
        items: [
          'AI 가 작성한 초안은 사실과 다르거나 부정확한 내용을 포함할 수 있습니다.',
          '이용자는 초안을 게시하거나 외부에 공유하기 전에 내용을 직접 검토할 책임이 있습니다.',
          '서비스는 AI 생성 결과의 정확성이나 특정 목적에의 적합성을 보증하지 않습니다.',
        ],
      },
      {
        heading: '5. 이용자 콘텐츠',
        items: [
          '이용자가 작성한 초안과 게시글 등 콘텐츠의 권리는 이용자에게 있습니다.',
          '이용자는 서비스가 공개 게시글을 서비스 화면에 표시하고 검색 엔진에 노출하는 데 필요한 범위에서 콘텐츠를 이용하도록 허락합니다.',
          '이용자는 게시하는 콘텐츠(저장소의 코드 조각 포함)를 공개할 권리가 있어야 하며, 비공개 저장소의 내용을 게시하여 생기는 문제는 이용자에게 책임이 있습니다.',
          '이용자는 언제든지 게시를 취소하거나 초안을 삭제할 수 있습니다.',
        ],
      },
      {
        heading: '6. 금지 행위',
        paragraphs: ['이용자는 다음 행위를 해서는 안 됩니다.'],
        items: [
          '타인의 저작권, 개인정보 등 권리를 침해하는 콘텐츠의 작성·게시',
          '법령에 위반되거나 공공질서에 반하는 콘텐츠의 작성·게시',
          '서비스의 정상적인 운영을 방해하거나 사용량 한도를 우회하는 행위',
          '자동화된 수단으로 서비스를 과도하게 이용하는 행위',
        ],
      },
      {
        heading: '7. 이용 제한과 탈퇴',
        items: [
          '이용자가 이 약관을 위반하면 서비스는 콘텐츠를 비공개 처리하거나 이용을 제한할 수 있습니다.',
          '이용자는 언제든지 프로필 메뉴의 회원탈퇴로 직접 탈퇴하거나 아래 문의처 이메일로 탈퇴를 요청할 수 있으며, 탈퇴하면 이용자의 정보와 콘텐츠는 개인정보처리방침에 따라 삭제됩니다.',
        ],
      },
      {
        heading: '8. 서비스의 변경과 중단',
        items: [
          '서비스는 기능을 추가·변경하거나 운영상 필요에 따라 서비스의 전부 또는 일부를 중단할 수 있으며, 가능한 경우 미리 알립니다.',
          'GitHub, AI 서비스 제공자 등 외부 서비스의 장애로 서비스가 원활하지 않을 수 있습니다.',
        ],
      },
      {
        heading: '9. 책임의 제한',
        paragraphs: [
          '서비스는 무료로 제공되며, 운영자의 고의 또는 중대한 과실이 없는 한 서비스 이용으로 생긴 손해에 대해 책임지지 않습니다.',
        ],
      },
      {
        heading: '10. 약관의 변경',
        paragraphs: [
          '이 약관이 변경되면 시행일과 함께 이 페이지에 게시합니다. 변경 후에도 서비스를 계속 이용하면 변경된 약관에 동의한 것으로 봅니다.',
        ],
      },
      {
        heading: '11. 준거법',
        paragraphs: ['이 약관은 대한민국 법률에 따라 해석됩니다.'],
      },
      {
        heading: '12. 문의처',
        paragraphs: [
          '약관과 서비스 이용에 관한 문의는 서비스 운영자에게 이메일로 보내 주세요.',
        ],
        contact: true,
      },
    ],
  },
  en: {
    title: 'Terms of Service',
    effectiveDate: '2026-11-14',
    intro:
      'These terms set out the conditions for using comdraft (the "Service") and the rights and obligations of users and the Service operator. By using the Service, you agree to these terms.',
    sections: [
      {
        heading: '1. The Service',
        paragraphs: ['The Service provides the following features.'],
        items: [
          'Signing in with a GitHub account and connecting repositories to view and select commit history',
          'AI-written tech blog drafts based on the selected commits',
          'An editor for revising drafts and publishing them on the Service',
          'Exporting drafts as HTML or Markdown files to share on other blogs',
        ],
      },
      {
        heading: '2. Accounts',
        items: [
          'You can sign up and sign in to the Service only with a GitHub account.',
          'You are responsible for keeping your GitHub account secure.',
          'The Service accesses your connected repositories only within the scope you grant to its GitHub App.',
        ],
      },
      {
        heading: '3. AI usage',
        items: [
          'AI draft writing has a usage limit per account tier, which resets on a set schedule.',
          'The Service may change the limits and the available AI models depending on operating conditions.',
        ],
      },
      {
        heading: '4. AI-generated results',
        items: [
          'AI-written drafts may contain inaccurate or incorrect information.',
          'You are responsible for reviewing a draft yourself before publishing or sharing it elsewhere.',
          'The Service does not guarantee the accuracy of AI-generated results or their fitness for any particular purpose.',
        ],
      },
      {
        heading: '5. Your content',
        items: [
          'You own the rights to the drafts, posts, and other content you write.',
          'You allow the Service to use your content as needed to show public posts on the Service and make them visible to search engines.',
          'You must have the right to publish the content you post (including code snippets from repositories), and you are responsible for any issues that arise from publishing content from private repositories.',
          'You can unpublish a post or delete a draft at any time.',
        ],
      },
      {
        heading: '6. Prohibited conduct',
        paragraphs: ['You must not:'],
        items: [
          'Write or publish content that infringes the copyright, privacy, or other rights of others',
          'Write or publish content that violates the law or public order',
          'Interfere with the normal operation of the Service or circumvent usage limits',
          'Use the Service excessively through automated means',
        ],
      },
      {
        heading: '7. Restrictions and leaving the Service',
        items: [
          'If you violate these terms, the Service may hide your content or restrict your use.',
          'You may leave the Service at any time from Delete account in the profile menu or by email to the contact below. When you leave, your information and content are deleted according to the Privacy Policy.',
        ],
      },
      {
        heading: '8. Changes to and suspension of the Service',
        items: [
          'The Service may add or change features or suspend all or part of the Service when operationally necessary, with advance notice where possible.',
          'Outages of external services such as GitHub or the AI service provider may affect the Service.',
        ],
      },
      {
        heading: '9. Limitation of liability',
        paragraphs: [
          'The Service is provided free of charge, and the operator is not liable for damages arising from its use unless caused by the operator’s intent or gross negligence.',
        ],
      },
      {
        heading: '10. Changes to these terms',
        paragraphs: [
          'If these terms change, we will post them on this page with their effective date. Continuing to use the Service after a change means you agree to the updated terms.',
        ],
      },
      {
        heading: '11. Governing law',
        paragraphs: [
          'These terms are governed by the laws of the Republic of Korea.',
        ],
      },
      {
        heading: '12. Contact',
        paragraphs: [
          'For questions about these terms or using the Service, email the operator.',
        ],
        contact: true,
      },
    ],
  },
};
