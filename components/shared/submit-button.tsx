'use client';

import { useFormStatus } from 'react-dom';

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingText: string;
  className?: string;
}

// 서버 액션 폼 제출 중 중복 클릭 방지
const SubmitButton = ({
  children,
  pendingText,
  className,
}: SubmitButtonProps) => {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        className ?? 'rounded-md border px-3 py-1.5 text-sm disabled:opacity-50'
      }
    >
      {pending ? pendingText : children}
    </button>
  );
};

export default SubmitButton;
