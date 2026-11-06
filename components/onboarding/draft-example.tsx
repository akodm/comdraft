'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { SAMPLE_COMMITS } from '@/components/main/sample-commits';
import {
  arrowNudge,
  commitPulse,
  draftLift,
  loop,
  useSampleAnimate,
} from '@/components/shared/sample-motion';

// 커밋 선택 → 변환 → 초안 순으로 한 번씩 강조하는 4.5초 반복 타임라인
const DURATION = 4.5;

const COMMIT_PULSE = commitPulse(loop([0, 0.06, 0.13, 0.23, 1], DURATION));

const ARROW_NUDGE = arrowNudge(loop([0, 0.23, 0.32, 0.41, 1], DURATION));

const DRAFT_LIFT = draftLift(
  loop([0, 0.36, 0.52, 0.72, 1], DURATION),
  loop([0, 0.36, 0.52, 1], DURATION),
);

const SAMPLE_COMMIT = SAMPLE_COMMITS[0];

// 온보딩 완료 단계의 작성 예시 카드 (PC 레이아웃에서만 표시)
const DraftExample = () => {
  const { i18n } = useLingui();
  const animate = useSampleAnimate();

  return (
    <section className="hidden flex-col gap-3 pc:flex">
      <div className="flex items-center justify-between leading-[normal] whitespace-nowrap">
        <h2 className="text-[16px] font-bold text-ink">
          <Trans>작성 예시</Trans>
        </h2>
        <p className="text-[11px] text-ink-muted">
          <Trans>실제 데이터가 아닌 예시입니다</Trans>
        </p>
      </div>
      <div className="flex flex-col overflow-hidden border border-line">
        <div className="flex flex-col gap-3 bg-code p-4">
          <div className="flex items-center justify-between leading-[normal] whitespace-nowrap">
            <p className="font-mono text-[12px] text-white">
              dev-note / image-lab
            </p>
            <p className="text-[11px] text-ink-subtle">
              <Trans>개인 공개 저장소 · main</Trans>
            </p>
          </div>
          <motion.div
            animate={animate(COMMIT_PULSE)}
            className="flex h-10 items-center gap-2.5 border-t border-line-dark"
          >
            <Image
              src="/images/auth/commit-check.svg"
              alt=""
              width={16}
              height={16}
              className="shrink-0"
            />
            <p className="font-mono text-[12px] leading-[normal] whitespace-nowrap text-ink-subtle">
              {SAMPLE_COMMIT.hash}
            </p>
            <p className="min-w-0 flex-1 text-[13px] leading-[normal] font-medium text-white">
              {i18n._(SAMPLE_COMMIT.message)}
            </p>
          </motion.div>
        </div>
        <div className="flex h-9 items-center gap-2.5 bg-brand-soft px-4">
          <motion.span
            aria-hidden="true"
            animate={animate(ARROW_NUDGE)}
            className="relative size-4 shrink-0"
          >
            <span className="absolute inset-[-5%_-5%_-7.07%_-5%]">
              <Image
                src="/images/onboarding/arrow-down.svg"
                alt=""
                width={18}
                height={18}
                className="block size-full max-w-none"
              />
            </span>
          </motion.span>
          <p className="text-[12px] leading-[normal] font-bold whitespace-nowrap text-brand">
            <Trans>커밋의 맥락을 글의 흐름으로</Trans>
          </p>
        </div>
        <motion.div
          animate={animate(DRAFT_LIFT)}
          className="flex flex-col gap-2.5 bg-white p-4"
        >
          <div className="flex items-center justify-between leading-[normal] whitespace-nowrap">
            <p className="text-[12px] font-bold text-ink">
              <Trans>새 초안</Trans>
            </p>
            <p className="text-[11px] text-brand">
              <Trans>AI 초안 · 게시 전 검토 필요</Trans>
            </p>
          </div>
          <p className="text-[18px] leading-[1.45] font-bold tracking-[-0.5px] text-ink">
            <Trans>IntersectionObserver로 이미지 지연 로딩 구현하기</Trans>
          </p>
          <p className="text-[12px] leading-[1.8] text-ink-muted">
            <Trans>
              화면에 보이는 이미지부터 불러오도록 로딩 방식을 바꿨습니다. 이번
              글에서는 구현 과정과 확인할 점을 정리합니다.
            </Trans>
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default DraftExample;
