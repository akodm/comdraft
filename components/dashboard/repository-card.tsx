'use client';

import Image from 'next/image';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import RepositoryBadge from '@/components/dashboard/repository-badge';
import LocalizedLink from '@/components/shared/localized-link';
import type { DashboardRepository } from '@/lib/dashboard/queries';

interface RepositoryCardProps {
  repository: DashboardRepository;
}

/**
 * 대시보드 연동 저장소 카드
 * - 상단 아이콘: 공개 범위(공개/비공개), 소유 계정(개인/조직) — 툴팁으로 의미 안내
 * - 브랜치, 라이선스는 아이콘 + 값만 표시 (라이선스가 없으면 생략)
 * - "초안 보기"는 해당 저장소의 초안 작성 스튜디오로 이동
 */
const RepositoryCard = ({ repository }: RepositoryCardProps) => {
  const { t } = useLingui();
  const {
    ownerLogin,
    name,
    description,
    isPrivate,
    isOrganization,
    branch,
    license,
    draftCount,
    id,
  } = repository;
  const hasDrafts = draftCount > 0;

  return (
    <article className="flex flex-1 flex-col rounded-md border border-line bg-white">
      <div className="flex flex-1 flex-col gap-3 px-5 py-4 pc:gap-3.5 pc:p-5">
        <div className="flex items-start gap-3 pc:items-center pc:justify-between">
          <h2 className="min-w-0 flex-1 font-mono text-[16px] leading-[1.4] font-semibold wrap-anywhere text-ink pc:text-[18px] pc:tracking-[-0.5px]">
            {ownerLogin} / {name}
          </h2>
          {/* 제목 첫 줄 가운데에 맞춤 (16px × 1.4 = 22.4px, PC 는 세로 가운데 정렬) */}
          <div className="flex h-5.5 shrink-0 items-center gap-1 pc:h-auto pc:gap-2">
            <RepositoryBadge
              iconSrc={
                isPrivate
                  ? '/images/dashboard/lock-keyhole.svg'
                  : '/images/dashboard/globe.svg'
              }
              label={isPrivate ? t`비공개 저장소` : t`공개 저장소`}
            />
            <RepositoryBadge
              iconSrc={
                isOrganization
                  ? '/images/dashboard/building-2.svg'
                  : '/images/dashboard/user-round.svg'
              }
              label={isOrganization ? t`조직 저장소` : t`개인 저장소`}
            />
          </div>
        </div>
        {description && (
          <p className="line-clamp-2 text-[13px] leading-[1.8] break-keep text-ink-muted pc:text-[14px]">
            {description}
          </p>
        )}
        <dl className="flex items-center gap-4 text-[12px] leading-[normal] text-ink-muted pc:gap-6">
          <div className="flex min-w-0 items-center gap-1.75">
            <dt className="shrink-0">
              <Image
                src="/images/dashboard/git-branch.svg"
                alt={t`브랜치`}
                width={14}
                height={14}
              />
            </dt>
            <dd className="truncate font-mono">{branch}</dd>
          </div>
          {license && (
            <div className="flex min-w-0 items-center gap-1.75">
              <dt className="shrink-0">
                <Image
                  src="/images/dashboard/scale.svg"
                  alt={t`라이선스`}
                  width={14}
                  height={14}
                />
              </dt>
              <dd className="truncate">{license}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="flex h-11 items-center justify-between gap-3 border-t border-line px-5 pc:h-12">
        <p
          className={`flex items-center gap-1.75 text-[13px] leading-[normal] font-medium ${hasDrafts ? 'text-ink' : 'text-ink-muted'}`}
        >
          <Image
            src={
              hasDrafts
                ? '/images/dashboard/files.svg'
                : '/images/dashboard/files-muted.svg'
            }
            alt=""
            width={15}
            height={15}
          />
          <Plural value={draftCount} other="초안 #개" />
        </p>
        <LocalizedLink
          href={`/dashboard/repositories/${id}/drafts`}
          className="flex items-center gap-2 text-[12px] leading-[normal] font-medium whitespace-nowrap text-brand"
        >
          <Trans>초안 보기</Trans>
          <Image
            src="/images/dashboard/arrow-right.svg"
            alt=""
            width={15}
            height={15}
          />
        </LocalizedLink>
      </div>
    </article>
  );
};

export default RepositoryCard;
