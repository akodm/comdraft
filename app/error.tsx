'use client';

interface ErrorPageProps {
  retry: () => void;
}

// 페이지 렌더링과 Server Action 에서 처리되지 못한 오류의 공통 안내 화면
const ErrorPage = ({ retry }: ErrorPageProps) => {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <p role="alert" className="text-sm text-red-600">
        요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md border px-4 py-2"
      >
        다시 시도
      </button>
    </main>
  );
};

export default ErrorPage;
