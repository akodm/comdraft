import DailyLineChart from '@/components/admin/daily-line-chart';
import type { DailyViews } from '@/lib/admin/post-views';

/**
 * 게시글 일별 조회 수 선 그래프 (어드민, 한 계열이라 범례 없이 제목이 이름을 대신함)
 */

interface ViewsLineChartProps {
  data: DailyViews[];
  labels: {
    // 툴팁·표의 값 이름 (예: "조회")
    views: string;
    date: string;
    table: string;
    // 그래프 전체 설명 (스크린 리더)
    summary: string;
  };
  locale: string;
}

export default function ViewsLineChart({
  data,
  labels,
  locale,
}: ViewsLineChartProps) {
  return (
    <DailyLineChart
      data={data.map((point) => ({
        date: point.date,
        values: { views: point.views },
      }))}
      series={[
        { key: 'views', label: labels.views, color: 'var(--color-brand)' },
      ]}
      labels={{
        date: labels.date,
        table: labels.table,
        summary: labels.summary,
      }}
      locale={locale}
    />
  );
}
