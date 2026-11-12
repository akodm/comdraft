'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import OnboardingSelect from '@/components/onboarding/onboarding-select';
import ConfirmDialog from '@/components/shared/confirm-dialog';
import Spinner from '@/components/shared/spinner';
import { useStudio } from '@/components/studio/studio-context';
import {
  OUTLINE_BUTTON_CLASS,
  THIN_SCROLL_CLASS,
} from '@/components/studio/studio-styles';
import { useLocale } from '@/hooks/use-locale';
import { disconnectRepository } from '@/lib/actions/repositories';
import {
  changeRepositoryBranch,
  getRepositorySettings,
  listRepositoryBranchOptions,
  loadMorePromptHistory,
  type PromptHistoryPage,
  type RepositorySettingsResult,
} from '@/lib/actions/repository-settings';
import type { Locale } from '@/lib/i18n/config';
import {
  toUsagePercentLabel,
  type PromptHistoryItem,
} from '@/lib/studio/prompt-history';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      settings: Extract<RepositorySettingsResult, { status: 'ok' }>;
    };

type BranchNotice =
  | 'github_reauth'
  | 'unavailable'
  | 'error'
  | 'invalid'
  | 'changed';

const BRANCH_NOTICES: Record<BranchNotice, MessageDescriptor> = {
  github_reauth: msg`GitHub 인증이 만료되었습니다. 다시 로그인한 뒤 시도해주세요.`,
  unavailable: msg`저장소에 접근할 수 없어 브랜치를 불러오지 못했습니다.`,
  error: msg`브랜치를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.`,
  invalid: msg`선택한 브랜치를 찾을 수 없습니다. 목록을 다시 열어 주세요.`,
  changed: msg`브랜치를 바꿨습니다. 커밋 내역을 다시 불러옵니다.`,
};

const SHORT_SHA_LENGTH = 7;

// GitHub 커밋 페이지 주소
const toCommitUrl = (htmlUrl: string, sha: string) =>
  `${htmlUrl}/commit/${sha}`;

// 요청한 날짜 (ko: 11월 12일, en: Nov 12, 항상 서울 기준)
const formatHistoryDate = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));

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

const UsageLabel = ({ ratio }: { ratio: number | null }) => {
  if (ratio === null) {
    return null;
  }

  const label = toUsagePercentLabel(ratio);

  return label.kind === 'under_one' ? (
    <Trans>주간 제공량의 1% 미만</Trans>
  ) : (
    <Trans>주간 제공량의 {label.value}%</Trans>
  );
};

// 내역 한 줄: 요청 문구(최대 4줄), 사용한 커밋 해시, 사용 비율, 날짜
const HistoryItem = ({
  item,
  htmlUrl,
}: {
  item: PromptHistoryItem;
  htmlUrl: string;
}) => {
  const locale = useLocale();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="line-clamp-4 text-[13px] leading-[1.6] break-words whitespace-pre-line text-ink">
        {item.kind === 'fill' && (
          <span className="mr-1.5 text-[11px] font-medium text-ink-faint">
            <Trans>빈칸</Trans>
          </span>
        )}
        {item.prompt}
      </p>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-[normal] text-ink-faint">
        {item.commitShas.map((sha) => (
          <a
            key={sha}
            href={toCommitUrl(htmlUrl, sha)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-ink-muted underline-offset-2 hover:underline"
          >
            {sha.slice(0, SHORT_SHA_LENGTH)}
          </a>
        ))}
        <span>
          <UsageLabel ratio={item.usageRatio} />
        </span>
        <span>{formatHistoryDate(item.createdAt, locale)}</span>
        {item.status === 'failed' && (
          <span className="text-ink-subtle">
            <Trans>실패</Trans>
          </span>
        )}
      </div>
    </div>
  );
};

type MoreState = 'idle' | 'loading' | 'error';

/**
 * 프롬프트 내역 (최대 높이 안에서 스크롤, 눌러도 동작 없음)
 * - 처음에는 초안 작성 요청 5개, 목록 끝에 닿으면 5개씩 더 불러옴 (무한 스크롤)
 * - 빈칸 채우기는 앞 초안 작성 요청 아래에 한 단계 들여 쓴 트리로
 * - 실패하면 다시 시도 버튼 표시 (자동으로 반복 요청하지 않음)
 */
const PromptHistoryList = ({
  repositoryId,
  initialPage,
  htmlUrl,
}: {
  repositoryId: string;
  initialPage: PromptHistoryPage;
  htmlUrl: string;
}) => {
  const [entries, setEntries] = useState(initialPage.entries);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [moreState, setMoreState] = useState<MoreState>('idle');
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 같은 커서로 중복 요청하지 않도록 진행 중인 요청을 동기적으로 표시
  const isLoadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setMoreState('loading');

    try {
      const result = await loadMorePromptHistory(repositoryId, nextCursor);

      if (result.status !== 'ok') {
        setMoreState('error');

        return;
      }

      setEntries((previous) => {
        // 커서 기반이라 겹치지 않지만 만일에 대비해 중복 제거
        const loadedIds = new Set(previous.map(({ item }) => item.id));

        return [
          ...previous,
          ...result.entries.filter(({ item }) => !loadedIds.has(item.id)),
        ];
      });
      setNextCursor(result.nextCursor);
      setMoreState('idle');
    } catch {
      setMoreState('error');
    } finally {
      isLoadingRef.current = false;
    }
  }, [repositoryId, nextCursor]);

  // 항목 수가 바뀔 때마다 다시 감시해, 불러온 뒤에도 끝이 보이면 이어서 불러옴
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;

    if (!root || !sentinel || !nextCursor || moreState !== 'idle') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      // 미리 불러오지 않고 목록 끝이 실제로 보일 때만 (처음에는 5개만 보이도록)
      { root },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [entries.length, nextCursor, moreState, loadMore]);

  if (entries.length === 0) {
    return (
      <p className="rounded-md bg-surface px-4 py-6 text-center text-[13px] leading-[1.6] text-ink-faint">
        <Trans>아직 이 저장소로 보낸 작성 요청이 없습니다.</Trans>
      </p>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={`max-h-80 rounded-md bg-surface px-4 ${THIN_SCROLL_CLASS}`}
    >
      <ul className="flex flex-col divide-y divide-line">
        {entries.map(({ item, fills }) => (
          <li key={item.id} className="flex flex-col gap-3 py-3.5">
            <HistoryItem item={item} htmlUrl={htmlUrl} />
            {fills.length > 0 && (
              <ul className="ml-1 flex flex-col gap-3 border-l border-line pl-3.5">
                {fills.map((fill) => (
                  <li key={fill.id}>
                    <HistoryItem item={fill} htmlUrl={htmlUrl} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {nextCursor && (
        <div
          ref={sentinelRef}
          className="flex min-h-11 items-center justify-center text-[12px] leading-[1.6] text-ink-faint"
        >
          {moreState === 'loading' && (
            <Spinner label={<Trans>내역을 더 불러오는 중...</Trans>} />
          )}
          {moreState === 'error' && (
            <p role="alert" className="text-danger">
              <Trans>내역을 더 불러오지 못했습니다.</Trans>{' '}
              <button
                type="button"
                onClick={() => void loadMore()}
                className="underline"
              >
                <Trans>다시 시도</Trans>
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 연동 브랜치 변경
 * - 선택 상자를 처음 펼칠 때 GitHub 에서 브랜치 목록을 가져옴 (그 전에는 지금 브랜치만)
 * - 다른 브랜치를 고르면 바로 적용하고, 스튜디오 커밋 내역은 새 브랜치로 처음부터 다시 불러옴
 */
const BranchSection = () => {
  const { t, i18n } = useLingui();
  const labelId = useId();
  const noticeId = useId();
  const { repository } = useStudio();
  const [branches, setBranches] = useState<string[] | null>(null);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [notice, setNotice] = useState<BranchNotice | null>(null);
  const [isChanging, startChanging] = useTransition();
  const requestedRef = useRef(false);

  const ensureBranches = async () => {
    if (requestedRef.current) {
      return;
    }

    requestedRef.current = true;
    setIsLoadingBranches(true);

    try {
      const result = await listRepositoryBranchOptions(repository.id);

      if (result.status === 'ok') {
        setBranches(result.branches);
        setNotice(null);
      } else {
        setNotice(result.status);
        // 다음에 펼칠 때 다시 시도할 수 있게
        requestedRef.current = false;
      }
    } catch {
      setNotice('error');
      requestedRef.current = false;
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const options = (branches ?? [repository.branch]).map((name) => ({
    value: name,
    label: name === repository.defaultBranch ? t`${name} (기본 브랜치)` : name,
  }));

  const change = (branch: string) => {
    if (branch === repository.branch) {
      return;
    }

    setNotice(null);
    startChanging(async () => {
      try {
        const result = await changeRepositoryBranch(repository.id, branch);
        setNotice(result.status);
      } catch {
        setNotice('error');
      }
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>
        <span id={labelId}>
          <Trans>연동 브랜치</Trans>
        </span>
      </SectionTitle>
      {/* 펼치려고 누르거나 키보드로 포커스하면 그때 목록을 불러옴 */}
      <div
        onPointerDownCapture={() => void ensureBranches()}
        onFocusCapture={() => void ensureBranches()}
      >
        <OnboardingSelect
          labelId={labelId}
          options={options}
          value={repository.branch}
          onChange={change}
          placeholder={repository.branch}
          emptyContent={<Trans>브랜치가 없습니다.</Trans>}
          busy={isLoadingBranches || isChanging}
          disabled={isChanging}
          errorId={notice && notice !== 'changed' ? noticeId : undefined}
        />
      </div>
      <p className="text-[12px] leading-[1.6] break-keep text-ink-faint">
        <Trans>
          브랜치를 바꾸면 커밋 목록이 바뀔 수 있습니다. 선택하는 즉시 적용되며,
          커밋은 최근 30개부터 다시 불러옵니다.
        </Trans>
      </p>
      {notice && (
        <p
          id={noticeId}
          role={notice === 'changed' ? 'status' : 'alert'}
          className={`text-[12px] leading-[1.6] break-keep ${
            notice === 'changed' ? 'text-brand' : 'text-danger'
          }`}
        >
          {i18n._(BRANCH_NOTICES[notice])}
        </p>
      )}
    </section>
  );
};

/**
 * 저장소 삭제 (대시보드의 연결 해제와 같은 동작, 이 저장소의 초안·게시글도 함께 삭제되고 대시보드로 이동)
 */
const DeleteSection = ({
  draftCount,
  postCount,
}: {
  draftCount: number;
  postCount: number;
}) => {
  const { t } = useLingui();
  const { repository } = useStudio();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, startDeleting] = useTransition();
  const [hasError, setHasError] = useState(false);

  const remove = () => {
    setHasError(false);
    startDeleting(async () => {
      try {
        const formData = new FormData();
        formData.set('repositoryId', repository.id);
        // 성공하면 서버가 대시보드로 이동시킴
        await disconnectRepository(formData);
      } catch {
        setHasError(true);
      }
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>
        <Trans>저장소 삭제</Trans>
      </SectionTitle>
      <div className="flex flex-col gap-3 rounded-md border border-line p-4 pc:flex-row pc:items-center pc:justify-between">
        <p className="text-[12px] leading-[1.6] break-keep text-ink-muted">
          <Trans>
            연동을 해제하고 이 저장소의 초안과 게시글을 모두 삭제합니다.
          </Trans>
        </p>
        <button
          type="button"
          onClick={() => setIsConfirming(true)}
          className="flex h-8.5 shrink-0 items-center justify-center self-start rounded border border-danger bg-white px-3.5 text-[12px] leading-[normal] font-medium whitespace-nowrap text-danger pc:self-auto"
        >
          <Trans>저장소 삭제</Trans>
        </button>
      </div>
      {isConfirming && (
        <ConfirmDialog
          title={t`저장소를 삭제할까요?`}
          description={
            <Trans>
              이 저장소의 <Plural value={draftCount} other="초안 #개" />와{' '}
              <Plural value={postCount} other="게시글 #개" />가 함께 삭제됩니다.
              되돌릴 수 없습니다.
            </Trans>
          }
          confirmLabel={t`삭제`}
          tone="danger"
          isPending={isDeleting}
          error={
            hasError ? (
              <Trans>저장소를 삭제하지 못했습니다. 다시 시도해주세요.</Trans>
            ) : undefined
          }
          onConfirm={remove}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </section>
  );
};

const LoadingContent = () => (
  <div className="flex flex-col gap-8" aria-busy="true">
    <Skeleton className="h-60 w-full" />
    <Skeleton className="h-13 w-full" />
    <Skeleton className="h-19 w-full" />
  </div>
);

/**
 * 저장소 설정 탭: 프롬프트 내역, 연동 브랜치 변경, 저장소 삭제
 * - 열 때 한 번 조회 (내역, 삭제 확인에 쓸 초안·게시글 수)
 */
const RepositorySettingsPanel = () => {
  const { repository } = useStudio();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });

    try {
      const result = await getRepositorySettings(repository.id);
      setState(
        result.status === 'ok'
          ? { status: 'ready', settings: result }
          : { status: 'error' },
      );
    } catch {
      setState({ status: 'error' });
    }
  }, [repository.id]);

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
          <Trans>저장소 정보를 불러오지 못했습니다.</Trans>
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
          <Trans>프롬프트 내역</Trans>
        </SectionTitle>
        <PromptHistoryList
          repositoryId={repository.id}
          initialPage={settings.history}
          htmlUrl={repository.htmlUrl}
        />
      </section>
      <BranchSection />
      <DeleteSection
        draftCount={settings.draftCount}
        postCount={settings.postCount}
      />
    </div>
  );
};

export default RepositorySettingsPanel;
