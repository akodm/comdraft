import type { ReactNode } from 'react';

interface PageLayoutProps {
  header?: ReactNode;
  footer?: ReactNode;
  // main 요소의 클래스 (flex-1 은 항상 적용)
  className?: string;
  children: ReactNode;
}

/**
 * 모든 페이지의 공통 골격 (헤더 · 본문 · 푸터)
 * - 본문이 남는 높이를 모두 차지해 내용이 짧아도 푸터가 화면 맨 아래에 붙음
 */
const PageLayout = ({
  header,
  footer,
  className = '',
  children,
}: PageLayoutProps) => {
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <main className={`flex-1 ${className}`}>{children}</main>
      {footer}
    </div>
  );
};

export default PageLayout;
