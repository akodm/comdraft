import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';

// 예시 초안 본문 문단
const DRAFT_PARAGRAPHS = {
  why: {
    title: msg`왜 바꿨나요?`,
    body: msg`화면 밖의 이미지까지 한꺼번에 요청하지 않도록, 이미지가 화면에 들어올 때 로딩하는 방식으로 변경했습니다.`,
  },
  how: {
    title: msg`어떻게 구현했나요?`,
    body: msg`IntersectionObserver로 이미지의 화면 진입을 감지합니다. 관찰 로직은 useLazyImage 훅으로 분리하고, 컴포넌트가 언마운트되면 observer를 해제하도록 정리했습니다.`,
  },
  check: {
    title: msg`무엇을 확인할까요?`,
    body: msg`스크롤할 때 이미지가 정상적으로 나타나는지, 화면을 벗어난 뒤 관찰이 정리되는지 확인해야 합니다. 실제 성능 변화는 별도의 측정이 필요합니다.`,
  },
};

// 예시 초안의 코드 블록 (코드라 번역하지 않음)
const CLEANUP_CODE = [
  'useEffect(() => {',
  '  observer.observe(image);',
  '  return () => {',
  '    observer.disconnect();',
  '  };',
  '}, [image]);',
].join('\n');

// 편집기 상단의 내보내기/게시 표시 (예시 화면이라 동작 없음)
const TOOLBAR_ITEM_CLASS =
  'flex h-7.5 min-w-0 flex-1 items-center justify-center border px-2 text-[11px] leading-[1.2] whitespace-nowrap pc:flex-none pc:px-3.5';

interface DraftParagraphProps {
  paragraph: (typeof DRAFT_PARAGRAPHS)[keyof typeof DRAFT_PARAGRAPHS];
}

const DraftParagraph = ({ paragraph }: DraftParagraphProps) => {
  const { i18n } = useLingui();

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-[15px] leading-[1.2] font-bold text-ink pc:text-[18px]">
        {i18n._(paragraph.title)}
      </h4>
      <p className="text-[12px] leading-[1.9] text-ink-muted pc:text-[14px]">
        {i18n._(paragraph.body)}
      </p>
    </div>
  );
};

// 초안 예시의 출력: 커밋으로 만든 기술 블로그 초안 (정적 일러스트)
const SampleDraftEditor = () => {
  return (
    <div className="flex min-w-0 flex-col bg-white pc:flex-1">
      <div className="flex flex-col gap-3 border-b border-line p-4 pc:px-7 pc:py-4">
        <div className="flex items-center justify-between leading-[1.2] whitespace-nowrap">
          <p className="text-[13px] font-bold text-ink">
            <Trans>초안 편집기</Trans>
          </p>
          <p className="text-[11px] text-brand">
            <Trans>검토 전 초안</Trans>
          </p>
        </div>
        <div className="flex gap-2">
          <span
            className={`${TOOLBAR_ITEM_CLASS} border-line bg-white font-mono font-medium text-ink`}
          >
            HTML
          </span>
          <span
            className={`${TOOLBAR_ITEM_CLASS} border-line bg-white font-mono font-medium text-ink`}
          >
            MD
          </span>
          <span
            className={`${TOOLBAR_ITEM_CLASS} border-brand bg-brand font-medium text-white`}
          >
            <Trans>게시하기</Trans>
          </span>
        </div>
      </div>
      <article className="flex flex-col gap-6 p-4 pc:gap-6.5 pc:p-10">
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 text-[11px] leading-[1.2] whitespace-nowrap text-brand">
            <span>React</span>
            <span>
              <Trans>이미지 최적화</Trans>
            </span>
          </div>
          <h3 className="text-[22px] leading-[1.45] font-bold tracking-[-0.9px] text-ink pc:text-[30px]">
            <Trans>IntersectionObserver로 이미지 지연 로딩 구현하기</Trans>
          </h3>
        </div>
        <DraftParagraph paragraph={DRAFT_PARAGRAPHS.why} />
        <DraftParagraph paragraph={DRAFT_PARAGRAPHS.how} />
        <div className="flex flex-col gap-3 bg-surface p-3 font-mono pc:p-5">
          <p className="text-[10px] leading-[normal] whitespace-nowrap text-ink-faint">
            TypeScript · cleanup
          </p>
          <pre className="font-mono text-[10px] leading-[1.8] whitespace-pre-wrap text-ink pc:text-[13px]">
            {CLEANUP_CODE}
          </pre>
        </div>
        <DraftParagraph paragraph={DRAFT_PARAGRAPHS.check} />
        <div className="flex items-start gap-2">
          <Image
            src="/images/main/info.svg"
            alt=""
            width={15}
            height={15}
            className="shrink-0"
          />
          <p className="min-w-0 flex-1 text-[11px] leading-[1.7] text-ink-faint">
            <Trans>
              AI가 작성한 초안입니다. 코드와 설명을 검토한 후 게시하세요.
            </Trans>
          </p>
        </div>
      </article>
    </div>
  );
};

export default SampleDraftEditor;
