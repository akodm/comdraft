import { Trans } from '@lingui/react/macro';
import LocalizedLink from '@/components/shared/localized-link';
import { VIEW_RANGES, type ViewRange } from '@/lib/admin/post-views';

/**
 * 그래프 기간 고르기 (?range=7|30|90, 그래프 위 한 줄)
 */

interface RangeNavProps {
  range: ViewRange;
  // 스크린 리더용 이름 (예: "기간")
  label: string;
}

export default function RangeNav({ range, label }: RangeNavProps) {
  return (
    <nav className="flex gap-1" aria-label={label}>
      {VIEW_RANGES.map((days) => (
        <LocalizedLink
          key={days}
          href={`?range=${days}`}
          scroll={false}
          aria-current={days === range ? 'page' : undefined}
          className={`border px-2.5 py-1 text-[12px] ${
            days === range
              ? 'border-brand bg-brand-soft text-ink'
              : 'border-line text-ink-muted hover:text-ink'
          }`}
        >
          <Trans>{days}일</Trans>
        </LocalizedLink>
      ))}
    </nav>
  );
}
