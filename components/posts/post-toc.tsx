'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useLingui } from '@lingui/react/macro';
import type { PostHeading } from '@/lib/posts/post-outline';

interface PostTocProps {
  // 목차에 넣을 제목 (getTocHeadings 결과, 비어 있으면 그리지 않음)
  headings: PostHeading[];
}

// 제목 윗변이 화면 위에서 이 거리(px)를 지나면 그 제목을 읽는 중으로 봄
const READING_LINE = 96;
// 부드러운 스크롤이 끝났는지 알 수 없을 때(scrollend 미지원) 활성 고정을 푸는 시간
const SCROLL_LOCK_FALLBACK_MS = 1000;

// 관찰 영역을 위로 넓히는 정도 (화면 높이의 100배, 본문이 길어지거나 이미지로 늘어나도 위쪽 제목을 모두 덮음)
const OBSERVE_ABOVE = '10000%';

// 제목 단계별 들여쓰기 (H2 기준, Tailwind 가 찾을 수 있게 클래스를 그대로 씀)
const INDENT_CLASS: Record<number, string> = {
  2: 'pl-4',
  3: 'pl-7',
  4: 'pl-10',
  5: 'pl-13',
  6: 'pl-16',
};

// 스크롤해서 더 내려갈 수 없는 곳까지 왔는지 (스크롤이 없는 짧은 페이지는 아님, 소수점 오차 1px 허용)
const isAtPageBottom = () =>
  window.scrollY > 0 &&
  window.innerHeight + window.scrollY >=
    document.documentElement.scrollHeight - 1;

/**
 * 지금 읽는 제목: 읽는 선을 지난 마지막 제목 (아직 아무 제목도 지나지 않았으면 null)
 * - 맨 아래까지 내렸으면 짧은 마지막 절의 제목이 선에 닿지 못하므로 마지막 제목
 */
const findReadingId = (elements: HTMLElement[]) => {
  if (isAtPageBottom()) return elements.at(-1)?.id ?? null;

  return (
    elements.findLast(
      (element) => element.getBoundingClientRect().top <= READING_LINE,
    )?.id ?? null
  );
};

/**
 * 지금 읽는 제목 추적
 * - 관찰 영역을 화면 위쪽 전체부터 읽는 선까지로 잡아, 제목이 선을 넘을 때마다(멀리 건너뛰어도) 다시 계산
 * - 제목이 선을 넘지 않는 맨 아래 도달은 스크롤이 멈출 때(scrollend) 다시 계산
 * - 목차로 이동하는 동안은 지나치는 제목에 표시가 흔들리지 않도록 누른 항목에 고정
 */
const useReadingHeading = (idsKey: string) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const isLockedRef = useRef(false);
  const releaseLockRef = useRef<() => void>(() => {});

  useEffect(() => {
    const elements = idsKey.split('\n').flatMap((id) => {
      const element = document.getElementById(id);

      return element ? [element] : [];
    });

    if (elements.length === 0) return;

    let observer: IntersectionObserver | null = null;

    const update = () => {
      if (!isLockedRef.current) setActiveId(findReadingId(elements));
    };

    // 읽는 선의 위치가 화면 높이에 따라 달라지므로 크기가 바뀌면 새로 관찰
    const observe = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(update, {
        rootMargin: `${OBSERVE_ABOVE} 0px ${READING_LINE - window.innerHeight}px 0px`,
      });
      elements.forEach((element) => observer?.observe(element));
    };

    observe();
    window.addEventListener('resize', observe);
    window.addEventListener('scrollend', update);

    return () => {
      window.removeEventListener('resize', observe);
      window.removeEventListener('scrollend', update);
      observer?.disconnect();
      releaseLockRef.current();
    };
  }, [idsKey]);

  // 누른 제목을 활성으로 고정하고 스크롤이 멈추면 풂
  const lockTo = (id: string) => {
    releaseLockRef.current();
    isLockedRef.current = true;
    setActiveId(id);

    const release = () => {
      isLockedRef.current = false;
      window.clearTimeout(timer);
      window.removeEventListener('scrollend', release);
      releaseLockRef.current = () => {};
    };
    const timer = window.setTimeout(release, SCROLL_LOCK_FALLBACK_MS);

    window.addEventListener('scrollend', release);
    releaseLockRef.current = release;
  };

  return { activeId, lockTo };
};

/**
 * 게시글 우측 목차 (PC 레이아웃에서만, 글 제목 높이에서 시작해 스크롤을 따라 고정)
 * - 누르면 그 제목으로 부드럽게 이동하고 주소 해시를 맞춤 (움직임 줄이기 설정이면 바로 이동)
 * - 지금 읽는 제목은 진하게, 나머지는 흐리게 (글자색 투명도만 바꿈)
 */
const PostToc = ({ headings }: PostTocProps) => {
  const { t } = useLingui();
  // 서버가 다시 그려 배열이 새로 와도 제목이 같으면 관찰을 다시 만들지 않도록 문자열로 비교
  const { activeId, lockTo } = useReadingHeading(
    headings.map(({ id }) => id).join('\n'),
  );

  if (headings.length === 0) {
    return null;
  }

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);

    // 제목을 찾지 못하면 브라우저 기본 이동에 맡김
    if (!target) return;

    event.preventDefault();
    lockTo(id);

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    target.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });

    // 키보드로 이동한 뒤 다음 Tab 이 그 제목부터 이어지도록 포커스를 옮김 (Tab 순서에는 넣지 않음)
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });

    const hash = `#${encodeURIComponent(id)}`;

    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
  };

  return (
    <aside className="absolute top-0 bottom-0 left-full ml-12 hidden w-52 pt-14 pc:block">
      <nav
        aria-label={t`목차`}
        className="sticky top-14 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain scrollbar-hide"
      >
        <ol className="flex flex-col gap-0.5 border-l border-line">
          {headings.map(({ id, level, text }) => {
            const isActive = id === activeId;

            return (
              <li key={id}>
                <a
                  href={`#${encodeURIComponent(id)}`}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={(event) => handleClick(event, id)}
                  className={`block py-1 pr-2 text-[13px] leading-[1.6] break-keep wrap-break-word transition-colors duration-(--dur-short) ease-out ${INDENT_CLASS[level] ?? INDENT_CLASS[6]} ${
                    isActive ? 'text-ink' : 'text-ink/45 hover:text-ink/75'
                  }`}
                >
                  {text}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
};

export default PostToc;
