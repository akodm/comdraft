interface SpinnerProps {
  // 화면에는 보이지 않고 스크린 리더로만 읽히는 진행 상태 문구
  label: React.ReactNode;
}

// 버튼 안 문구 대신 표시하는 로딩 인디케이터 (글자색을 따름)
const Spinner = ({ label }: SpinnerProps) => {
  return (
    <>
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      <span className="sr-only">{label}</span>
    </>
  );
};

export default Spinner;
