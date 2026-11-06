'use client';

import Image from 'next/image';
import { motion, type TargetAndTransition } from 'motion/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { SAMPLE_COMMITS } from '@/components/main/sample-commits';
import {
  arrowNudge,
  commitPulse,
  draftLift,
  loop,
  useSampleAnimate,
} from '@/components/shared/sample-motion';

// 커밋 선택 → 변환 → 초안 → 내보내기 순으로 한 번씩 강조하는 6초 반복 타임라인
// 커밋 카드는 위에서부터 차례로 강조 (SAMPLE_COMMITS 순서)
const COMMIT_PULSES = [
  [0, 0.05, 0.1, 0.175, 1],
  [0, 0.1583, 0.2083, 0.2833, 1],
  [0, 0.2667, 0.3167, 0.3917, 1],
].map((times) => commitPulse(loop(times)));

const ARROW_NUDGE = arrowNudge(loop([0, 0.3167, 0.3833, 0.45, 1]));

const DRAFT_LIFT = draftLift(
  loop([0, 0.4, 0.5167, 0.6667, 1]),
  loop([0, 0.4, 0.5167, 1]),
);

const FORMATS_BLINK: TargetAndTransition = {
  opacity: [1, 1, 0.6, 1, 1],
  transition: loop([0, 0.6167, 0.6667, 0.75, 1]),
};

// 출력 형식 표시 (예시 화면이라 동작 없음)
const FORMAT_CLASS =
  'flex h-7 items-center border px-3 text-[11px] leading-[normal] whitespace-nowrap';

/**
 * 선택한 커밋이 AI 초안으로 바뀌는 과정을 보여주는 예시 카드
 * - 동작 줄이기 설정을 켠 사용자에게는 정지 화면으로 표시
 */
const CommitToDraftMotion = () => {
  const { i18n } = useLingui();
  const animate = useSampleAnimate();

  return (
    <div className="flex w-full flex-col overflow-hidden border border-line">
      <div className="flex flex-col gap-4 bg-code px-6 pt-5.5 pb-2">
        <div className="flex items-center justify-between leading-[normal] whitespace-nowrap">
          <p className="font-mono text-[13px] text-white">
            dev-note / image-lab
          </p>
          <p className="text-[11px] text-ink-subtle">
            <Trans>개인 공개 저장소 · main</Trans>
          </p>
        </div>
        <ul className="flex flex-col">
          {SAMPLE_COMMITS.map((commit, index) => (
            <motion.li
              key={commit.hash}
              animate={animate(COMMIT_PULSES[index])}
              className="flex h-13 items-center gap-3.5 border-t border-line-dark"
            >
              <Image
                src="/images/auth/commit-check.svg"
                alt=""
                width={16}
                height={16}
                className="shrink-0"
              />
              <p className="font-mono text-[12px] leading-[normal] whitespace-nowrap text-ink-subtle">
                {commit.hash}
              </p>
              <p className="min-w-0 flex-1 text-[14px] leading-[normal] font-medium text-white">
                {i18n._(commit.message)}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
      <div className="flex h-11 items-center gap-3 bg-brand-soft px-6">
        <motion.span
          aria-hidden="true"
          animate={animate(ARROW_NUDGE)}
          className="relative h-4.5 w-4 shrink-0"
        >
          <span className="absolute inset-[0_-3.34%_-5.98%_-3.34%]">
            <Image
              src="/images/auth/arrow-down-long.svg"
              alt=""
              width={17}
              height={19}
              className="block size-full max-w-none"
            />
          </span>
        </motion.span>
        <p className="text-[12px] leading-[normal] font-bold whitespace-nowrap text-brand">
          <Trans>선택한 커밋을 AI 초안으로</Trans>
        </p>
      </div>
      <motion.div
        animate={animate(DRAFT_LIFT)}
        className="flex flex-col gap-3.5 bg-white p-6"
      >
        <div className="flex items-center justify-between leading-[normal] whitespace-nowrap">
          <p className="text-[12px] font-bold text-ink">
            <Trans>새 초안</Trans>
          </p>
          <p className="text-[11px] text-brand">
            <Trans>AI 초안 · 게시 전 검토 필요</Trans>
          </p>
        </div>
        <p className="text-[23px] leading-[1.45] font-bold tracking-[-0.6px] text-ink">
          <Trans>IntersectionObserver로 이미지 지연 로딩 구현하기</Trans>
        </p>
        <p className="text-[13px] leading-[1.8] text-ink-muted">
          <Trans>
            화면에 보이는 이미지부터 불러오도록 로딩 방식을 바꿨습니다. 구현
            과정과 관찰 로직을 정리하고, 게시 전 확인할 점을 살펴봅니다.
          </Trans>
        </p>
        <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
          <p className="text-[12px] leading-[normal] whitespace-nowrap text-ink-muted">
            <Trans>다듬고, 검토한 뒤 어디든.</Trans>
          </p>
          <motion.div animate={animate(FORMATS_BLINK)} className="flex gap-2">
            <span
              className={`${FORMAT_CLASS} border-line bg-white font-mono text-ink`}
            >
              HTML
            </span>
            <span
              className={`${FORMAT_CLASS} border-line bg-white font-mono text-ink`}
            >
              MD
            </span>
            <span
              className={`${FORMAT_CLASS} border-brand bg-brand text-white`}
            >
              <Trans>게시하기</Trans>
            </span>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default CommitToDraftMotion;
