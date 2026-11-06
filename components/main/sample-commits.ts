import { msg } from '@lingui/core/macro';

// 예시로 선택된 커밋 (해시와 파일 경로는 코드라 번역하지 않음)
export const SAMPLE_COMMITS = [
  {
    hash: 'a8f2c91',
    message: msg`feat: 이미지 지연 로딩 적용`,
    file: 'src/components/LazyImage.tsx',
    summary: msg`IntersectionObserver로 화면 진입 감지`,
  },
  {
    hash: 'b74e3d0',
    message: msg`refactor: 이미지 로딩 훅 분리`,
    file: 'src/hooks/useLazyImage.ts',
    summary: msg`관찰 로직을 재사용 가능한 훅으로 분리`,
  },
  {
    hash: 'c19d5a2',
    message: msg`fix: 언마운트 시 observer 해제`,
    file: 'src/hooks/useLazyImage.ts',
    summary: msg`cleanup에서 disconnect() 호출`,
  },
];
