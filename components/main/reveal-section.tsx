'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';

/**
 * 화면에 들어오면 한 번 data-revealed 를 다는 섹션 (안의 [data-reveal] 요소가 순서대로 떠오름)
 * - 아래쪽 15% 안으로 들어와야 시작해 너무 일찍 끝나지 않게 함
 * - 위쪽 여백을 크게 줘서, 빠르게 지나쳐 이미 화면 위로 올라간 섹션도 보인 것으로 침 (숨은 채 남지 않게)
 * - 한 번 보이면 관찰을 멈춤 (다시 스크롤해도 숨기지 않음)
 */
const RevealSection = ({ children, ...props }: ComponentProps<'section'>) => {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        setRevealed(true);
        observer.disconnect();
      },
      { rootMargin: '100000px 0px -15% 0px' },
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} data-revealed={revealed || undefined} {...props}>
      {children}
    </section>
  );
};

export default RevealSection;
