import BrandLogo from '@/components/main/brand-logo';

/**
 * 어드민 로그인·임시 비밀번호 변경 화면 틀
 * - 헤더·사이드 메뉴 없이 화면 가운데에 폼 카드만
 */
export default function AdminAuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="flex w-full max-w-95 flex-col gap-8 border border-line bg-white p-6 lg:p-8">
        <BrandLogo placement="auth" />
        {children}
      </div>
    </main>
  );
}
