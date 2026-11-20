'use client';

import { useId, useState } from 'react';
import type { DailyViews } from '@/lib/admin/post-views';
import { viewAxisTicks } from '@/lib/admin/post-views';

/**
 * 일별 조회 수 선 그래프 (어드민)
 * - 한 계열이라 범례 없이 제목이 이름을 대신함, 선 2px·브랜드 색, 격자·축은 흐리게
 * - 마우스·터치·화살표 키로 날짜를 고르면 세로 기준선과 표식, 툴팁(날짜·조회 수)을 보여 줌
 * - 색만으로 읽지 않도록 표로 보기를 함께 둠
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

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
// x 축 날짜 글자는 최대 이 개수만 (겹치지 않게)
const MAX_X_LABELS = 6;

// 양 끝 날짜 글자는 그래프 밖으로 나가지 않게 안쪽으로 붙임
const labelAnchor = (index: number, length: number) => {
  if (index === 0) {
    return 'start';
  }

  return index === length - 1 ? 'end' : 'middle';
};

const formatShortDate = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(
    new Date(`${date}T00:00:00`),
  );

const formatLongDate = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${date}T00:00:00`));

export default function ViewsLineChart({
  data,
  labels,
  locale,
}: ViewsLineChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  const ticks = viewAxisTicks(Math.max(0, ...data.map((point) => point.views)));
  const top = ticks[ticks.length - 1];
  const x = (index: number) =>
    PAD.left +
    (data.length <= 1 ? PLOT_W / 2 : (index / (data.length - 1)) * PLOT_W);
  const y = (value: number) => PAD.top + PLOT_H - (value / top) * PLOT_H;

  const line = data
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.views)}`,
    )
    .join(' ');
  const area = `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  const labelEvery = Math.max(1, Math.ceil(data.length / MAX_X_LABELS));
  const xLabels = data
    .map((point, index) => ({ point, index }))
    .filter(
      ({ index }) => index % labelEvery === 0 || index === data.length - 1,
    )
    // 마지막 날과 너무 가까운 앞 글자는 뺌
    .filter(
      ({ index }, position, all) =>
        index === data.length - 1 ||
        position === all.length - 1 ||
        data.length - 1 - index >= labelEvery / 2,
    );

  // 포인터 위치에서 가장 가까운 날
  const pick = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left) / rect.width;
    const plotX = ratio * WIDTH - PAD.left;
    const index = Math.round((plotX / PLOT_W) * (data.length - 1));

    setActive(Math.min(data.length - 1, Math.max(0, index)));
  };

  const activePoint = active === null ? null : data[active];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-brand"
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={(event) =>
            pick(event.clientX, event.currentTarget.getBoundingClientRect())
          }
          onPointerDown={(event) =>
            pick(event.clientX, event.currentTarget.getBoundingClientRect())
          }
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              const step = event.key === 'ArrowLeft' ? -1 : 1;

              setActive((current) =>
                Math.min(
                  data.length - 1,
                  Math.max(
                    0,
                    (current ?? data.length - 1) +
                      (current === null ? 0 : step),
                  ),
                ),
              );
            }
          }}
        >
          <title id={titleId}>{labels.summary}</title>

          {/* 가로 격자와 y 축 눈금 (흐리게) */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--color-line)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--color-ink-faint)"
              >
                {tick.toLocaleString(locale)}
              </text>
            </g>
          ))}

          {/* x 축 날짜 */}
          {xLabels.map(({ point, index }) => (
            <text
              key={point.date}
              x={x(index)}
              y={HEIGHT - 8}
              textAnchor={labelAnchor(index, data.length)}
              fontSize={11}
              fill="var(--color-ink-faint)"
            >
              {formatShortDate(point.date, locale)}
            </text>
          ))}

          <path d={area} fill="var(--color-brand-soft)" opacity={0.6} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* 고른 날: 세로 기준선 + 표식 (표면색 고리로 선과 구분) */}
          {active !== null && activePoint ? (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                stroke="var(--color-ink-subtle)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={x(active)}
                cy={y(activePoint.views)}
                r={5}
                fill="var(--color-brand)"
                stroke="var(--color-panel)"
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>

        {active !== null && activePoint ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 whitespace-nowrap border border-line bg-panel px-2.5 py-1.5 text-xs text-ink shadow-sm"
            style={{
              left: `${(x(active) / WIDTH) * 100}%`,
              transform:
                active > data.length / 2
                  ? 'translateX(calc(-100% - 8px))'
                  : 'translateX(8px)',
            }}
          >
            <div className="text-ink-muted">
              {formatLongDate(activePoint.date, locale)}
            </div>
            <div className="font-medium tabular-nums">
              {labels.views} {activePoint.views.toLocaleString(locale)}
            </div>
          </div>
        ) : null}
      </div>

      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer select-none">{labels.table}</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full max-w-sm border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-1 pr-4 font-normal">{labels.date}</th>
                <th className="py-1 text-right font-normal">{labels.views}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((point) => (
                <tr key={point.date} className="border-b border-line/60">
                  <td className="py-1 pr-4">{point.date}</td>
                  <td className="py-1 text-right tabular-nums text-ink">
                    {point.views.toLocaleString(locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
