'use client';

import Image from 'next/image';
import { useLingui } from '@lingui/react/macro';
import Tooltip from '@/components/shared/tooltip';
import { MAX_GENERATION_COMMITS } from '@/lib/generation/limits';
import type { CommitMarker } from '@/lib/auto-draft/markers';

const MARKER_ICONS: Record<CommitMarker['kind'], string> = {
  anchor: '/images/studio/flag.svg',
  auto: '/images/studio/layers.svg',
  excluded: '/images/studio/circle-slash.svg',
  not_collected: '/images/studio/git-merge.svg',
};

interface CommitMarkersProps {
  markers: CommitMarker[];
}

/**
 * 커밋 줄의 자동 초안 표시 아이콘 (기준점, 자동 대상, 제외됨, 수집 안 됨)
 * - 아이콘마다 같은 문구의 툴팁과 aria-label, 키보드로 포커스해 툴팁을 볼 수 있음
 */
const CommitMarkers = ({ markers }: CommitMarkersProps) => {
  const { t } = useLingui();
  const max = MAX_GENERATION_COMMITS;

  const getLabel = (marker: CommitMarker) => {
    switch (marker.kind) {
      case 'anchor':
        return t`자동 초안은 이 커밋부터 위로 최대 ${max}개를 사용합니다`;
      case 'auto': {
        const position = marker.position;

        return t`[comdraft] 커밋을 올리면 이 커밋이 초안에 포함됩니다 (${position}/${max})`;
      }
      case 'excluded':
        return marker.reason === 'force_push'
          ? t`force push 로 올라와 제외된 커밋입니다`
          : t`제외한 커밋입니다. 자동 대상에 들어가지 않습니다`;
      case 'not_collected':
        return t`머지 커밋이나 GitHub 에서 만든 커밋은 자동 대상에 들어가지 않습니다`;
    }
  };

  return markers.map((marker) => {
    const label = getLabel(marker);

    return (
      <Tooltip key={marker.kind} label={label}>
        <span
          // 키보드로 포커스해야 툴팁을 볼 수 있어 아이콘도 포커스를 받음
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          role="img"
          aria-label={label}
          className="flex size-5 shrink-0 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Image
            src={MARKER_ICONS[marker.kind]}
            alt=""
            width={14}
            height={14}
          />
        </span>
      </Tooltip>
    );
  });
};

export default CommitMarkers;
