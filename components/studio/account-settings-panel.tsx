'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Trans } from '@lingui/react/macro';
import { useLocale } from '@/hooks/use-locale';
import {
  getResetCountdown,
  msUntilNextMinute,
  toUsedPercent,
  type ResetCountdown,
} from '@/lib/account/settings';
import {
  getAccountSettings,
  type AccountSettings,
} from '@/lib/actions/account';
import { formatQuotaReset } from '@/lib/generation/quota-format';
import { OUTLINE_BUTTON_CLASS } from '@/components/studio/studio-styles';

// 등급 이름 (제품 등급 이름이라 번역하지 않음, 모르는 등급은 첫 글자만 대문자로)
const PLAN_NAMES: Record<string, string> = {
  basic: 'Basic',
  pro: 'Pro',
  max: 'Max',
};

const toPlanName = (plan: string) =>
  PLAN_NAMES[plan] ?? `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`;

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; settings: AccountSettings; clockOffsetMs: number };

/**
 * 서버 시각에 맞춘 현재 시각 (분 경계마다 갱신)
 * - clockOffsetMs = 서버 시각 - 기기 시각 (기기 시계가 틀려도 남은 시간이 맞게 보이도록)
 * - 이 패널이 열려 있는 동안에만 타이머가 돎
 */
const useServerMinuteClock = (clockOffsetMs: number | null) => {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (clockOffsetMs === null) {
      return;
    }

    let timer: number | undefined;
    const tick = () => {
      const current = new Date(Date.now() + clockOffsetMs);
      setNow(current);
      timer = window.setTimeout(tick, msUntilNextMinute(current));
    };

    tick();

    return () => window.clearTimeout(timer);
  }, [clockOffsetMs]);

  return now;
};

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="text-[12px] leading-[normal] font-bold text-ink-faint">
    {children}
  </h3>
);

const Skeleton = ({ className }: { className: string }) => (
  <div
    aria-hidden="true"
    className={`animate-pulse rounded bg-surface ${className}`}
  />
);

const CountdownText = ({ countdown }: { countdown: ResetCountdown }) => {
  const { days, hours, minutes } = countdown;

  if (days > 0) {
    return (
      <Trans>
        초기화까지 {days}일 {hours}시간
      </Trans>
    );
  }

  if (hours > 0) {
    return (
      <Trans>
        초기화까지 {hours}시간 {minutes}분
      </Trans>
    );
  }

  return <Trans>초기화까지 {minutes}분</Trans>;
};

const AccountSection = ({ settings }: { settings: AccountSettings }) => {
  const { github } = settings;
  const avatar = github?.avatarUrl ?? settings.image;
  const displayName = github?.name || settings.name;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-line p-4 pc:flex-row pc:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white">
          {avatar ? (
            <Image
              src={avatar}
              alt=""
              width={44}
              height={44}
              className="size-full object-cover"
            />
          ) : (
            <Image
              src="/images/studio/profile.svg"
              alt=""
              width={20}
              height={20}
            />
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-[14px] leading-[normal] font-bold text-ink">
            {displayName}
          </p>
          {github && (
            <p className="truncate font-mono text-[12px] leading-[normal] text-ink-faint">
              @{github.login}
            </p>
          )}
          <p className="truncate text-[12px] leading-[normal] text-ink-muted">
            {settings.email}
          </p>
        </div>
      </div>
      {github && (
        <a
          href={github.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`h-8.5 self-start text-[12px] leading-[normal] font-medium pc:self-auto ${OUTLINE_BUTTON_CLASS}`}
        >
          <Trans>GitHub 프로필</Trans>
          <Image
            src="/images/studio/external-link.svg"
            alt=""
            width={14}
            height={14}
          />
        </a>
      )}
    </div>
  );
};

// "현재 사용량" 과 그 옆의 등급 이름 (등급은 바꿀 수 없어 버튼·배지 없이 글자만)
const UsageLabel = ({ plan }: { plan: string }) => (
  <span className="flex items-baseline gap-2 text-[13px] leading-[normal]">
    <span className="text-ink-muted">
      <Trans>현재 사용량</Trans>
    </span>
    <span className="font-bold text-brand">{toPlanName(plan)}</span>
  </span>
);

const UsageSection = ({
  plan,
  quota,
  now,
}: {
  plan: string;
  quota: AccountSettings['quota'];
  now: Date | null;
}) => {
  const locale = useLocale();

  if (!quota) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-line p-4">
        <UsageLabel plan={plan} />
        <p className="text-[13px] leading-[1.6] text-ink-faint">
          <Trans>사용량을 확인할 수 없습니다.</Trans>
        </p>
      </div>
    );
  }

  const percent = toUsedPercent(quota.remainingRatio);
  const resetsAt = new Date(quota.resetsAt);
  const resetTime = formatQuotaReset(resetsAt, locale);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-4">
      <div className="flex items-baseline justify-between gap-3">
        <UsageLabel plan={plan} />
        <span className="font-mono text-[18px] leading-[normal] font-bold text-ink">
          {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${percent}%`}
        className="h-2 overflow-hidden rounded-full bg-surface"
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex flex-col gap-1 text-[12px] leading-[1.6] pc:flex-row pc:justify-between">
        <span className="font-medium text-ink">
          {now ? (
            <CountdownText countdown={getResetCountdown(resetsAt, now)} />
          ) : null}
        </span>
        <span className="text-ink-faint">
          <Trans>{resetTime} 초기화</Trans>
        </span>
      </div>
    </div>
  );
};

const LoadingContent = () => (
  <div className="flex flex-col gap-8" aria-busy="true">
    <Skeleton className="h-19.5 w-full" />
    <Skeleton className="h-27 w-full" />
  </div>
);

/**
 * 계정 설정 탭
 * - 열 때 한 번 조회: 연동 계정(GitHub 프로필), 현재 등급, 이번 주 사용량 비율, 초기화 시각
 * - 사용량은 쓴 비율로 보여 주고, 등급 이름은 "현재 사용량" 옆에 글자로만 둠 (등급 변경 기능이 없어서)
 * - 초기화까지 남은 시간은 서버 시각 기준으로 분마다 다시 계산 (열려 있는 동안만)
 */
const AccountSettingsPanel = () => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const now = useServerMinuteClock(
    state.status === 'ready' ? state.clockOffsetMs : null,
  );

  const load = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const settings = await getAccountSettings();
      setState({
        status: 'ready',
        settings,
        clockOffsetMs: new Date(settings.serverNow).getTime() - Date.now(),
      });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') {
    return <LoadingContent />;
  }

  if (state.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-[13px] leading-[1.6] text-danger">
          <Trans>계정 정보를 불러오지 못했습니다.</Trans>
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className={`h-8.5 text-[12px] leading-[normal] font-medium ${OUTLINE_BUTTON_CLASS}`}
        >
          <Trans>다시 시도</Trans>
        </button>
      </div>
    );
  }

  const { settings } = state;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <SectionTitle>
          <Trans>연동 계정</Trans>
        </SectionTitle>
        <AccountSection settings={settings} />
      </section>
      <section className="flex flex-col gap-3">
        <SectionTitle>
          <Trans>AI 사용량</Trans>
        </SectionTitle>
        <UsageSection plan={settings.plan} quota={settings.quota} now={now} />
      </section>
    </div>
  );
};

export default AccountSettingsPanel;
