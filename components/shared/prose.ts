/**
 * 초안 본문 스타일 (편집기와 게시글 상세가 같은 모양으로 보이도록 공유)
 * - 글자 크기/색은 prose 요소 수식어로 디자인 값에 맞춤 (모바일 → pc: PC)
 * - 블록 사이 간격은 prose 기본 여백 대신 디자인 간격으로 통일 (제목 다음은 좁게)
 */
export const PROSE_CLASS = [
  // flex-1: 내용이 짧아도 편집 가능 영역이 남는 높이를 채워, 빈 곳을 눌러도 편집기에 포커스
  'prose max-w-none flex-1 outline-none',
  // 색
  'prose-headings:font-bold prose-headings:text-ink prose-p:text-ink-muted prose-li:text-ink-muted prose-strong:text-ink prose-a:text-brand prose-li:marker:text-ink-faint',
  'prose-blockquote:border-line prose-blockquote:font-normal prose-blockquote:text-ink-muted prose-blockquote:not-italic',
  // 크기
  'prose-h1:text-[23px] prose-h1:leading-[1.5] prose-h1:tracking-[-0.8px] pc:prose-h1:text-[32px] pc:prose-h1:tracking-[-1px]',
  'prose-h2:text-[17px] prose-h2:leading-[1.5] prose-h2:tracking-[-0.4px] pc:prose-h2:text-[19px]',
  'prose-h3:text-[15px] prose-h3:leading-[1.5] pc:prose-h3:text-[17px]',
  // H4~H6: 단계마다 1px 씩 작게 (H5 는 본문과 같은 크기지만 굵기와 색으로, H6 은 본문보다 작게 구분)
  'prose-h4:text-[14px] prose-h4:leading-[1.5] pc:prose-h4:text-[16px]',
  'prose-h5:text-[13px] prose-h5:leading-[1.6] pc:prose-h5:text-[15px]',
  'prose-h6:text-[12px] prose-h6:leading-[1.6] pc:prose-h6:text-[14px]',
  'prose-p:text-[13px] prose-p:leading-[1.95] pc:prose-p:text-[15px]',
  'prose-li:text-[13px] prose-li:leading-[1.95] pc:prose-li:text-[15px] prose-li:my-1',
  'prose-blockquote:text-[13px] prose-blockquote:leading-[1.95] pc:prose-blockquote:text-[15px]',
  // 인라인 코드 (prose 기본 백틱 표시 제거)
  'prose-code:rounded prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:text-ink prose-code:before:content-none prose-code:after:content-none',
  // 블록 간격: 기본 26px(PC 24px), 문서 제목 다음 16px(18px), 소제목 다음 10px(8px), H3~H6 다음 8px
  '[&>*]:mb-0! [&>*]:mt-6.5! pc:[&>*]:mt-6! [&>h1+*]:mt-4! pc:[&>h1+*]:mt-4.5! [&>h2+*]:mt-2.5! pc:[&>h2+*]:mt-2! [&>:is(h3,h4,h5,h6)+*]:mt-2! [&>:first-child]:mt-0!',
  // 빈 줄 안내 문구 (Placeholder 확장)
  '[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0 [&_.is-empty]:before:text-ink-subtle [&_.is-empty]:before:content-[attr(data-placeholder)]',
  // 빈칸 안 빈 문단은 빈칸 노드 뷰가 정한 문구로 (draft-blank-node-view 의 --blank-placeholder)
  '[&_[data-blank-content]_.is-empty]:before:content-(--blank-placeholder)',
].join(' ');
