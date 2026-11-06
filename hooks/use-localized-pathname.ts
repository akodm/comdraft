import { usePathname } from 'next/navigation';
import { splitLocalePath } from '@/lib/i18n/config';

/**
 * 로케일 접두사를 뗀 현재 경로 (`/en/dashboard` → `/dashboard`)
 * - 내비게이션 활성 상태 비교나 언어 전환 링크처럼 로케일과 무관한 경로가 필요할 때 사용
 */
export const useLocalizedPathname = () => {
  const pathname = usePathname();

  return splitLocalePath(pathname ?? '/').path;
};
