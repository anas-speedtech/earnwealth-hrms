import { ReactNode } from 'react';

/* ---------------------------------------------------------------------------
 * Pure-SVG charts. No chart library is installed in this project, so the two
 * visuals every dashboard needs (grouped attendance bars and a proportion
 * donut) are drawn directly. Keeping them dependency-free leaves the bundle
 * and build step unchanged.
 * ------------------------------------------------------------------------- */

export interface BarGroup {
  label: string;
  /** series[0] renders as the primary colour, series[1] as the muted one */
  series: [number, number];
}

export interface BarChartProps {
  data: BarGroup[];
  colors?: [string, string];
  height?: number;
  /** tick values on the y axis, e.g. [0, 25, 50, 75, 100] */
  ticks?: number[];
}

export function BarChart({ data, colors = ['#10b981', '#f87171'], height = 200, ticks }: BarChartProps) {
  const maxRaw = Math.max(...data.flatMap((d) => d.series), 1);
  // Round the top of the axis up to a step so no bar touches it.
  const step = ticks && ticks.length > 1 ? Math.max(ticks[ticks.length - 1] - ticks[ticks.length - 2], 1) : 25;
  const max = Math.max(Math.ceil(maxRaw / step) * step, step);
  const computedTicks = ticks && ticks.length > 1 ? ticks : [0, Math.round(max / 2), max];

  const padL = 34;
  const padB = 24;
  const padT = 8;
  const width = 520;
  const plotW = width - padL - 8;
  const plotH = height - padT - padB;

  const band = plotW / Math.max(data.length, 1);
  const barW = Math.min(16, band / 2.6);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Bar chart">
      {computedTicks.map((t) => {
        const y = padT + plotH - (t / max) * plotH;
        return (
          <g key={t}>
            <line x1={padL} y1={y} x2={width - 8} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="9" fill="#94a3b8">
              {t}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const cx = padL + band * i + band / 2;
        return (
          <g key={d.label}>
            {d.series.map((v, si) => {
              const h = (v / max) * plotH;
              const x = cx - barW - 1.5 + si * (barW + 3);
              const y = padT + plotH - h;
              return <rect key={si} x={x} y={y} width={barW} height={h} rx="2.5" fill={colors[si]} />;
            })}
            <text x={cx} y={height - 6} textAnchor="middle" fontSize="9" fill="#64748b">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BarLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
}

export function DonutChart({ data, size = 168, thickness = 22, centerValue, centerLabel }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Donut chart">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
      {data
        .filter((d) => d.value > 0)
        .map((d) => {
          const frac = d.value / total;
          const len = frac * circumference;
          const el = (
            <circle
              key={d.label}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${c} ${c})`}
            />
          );
          offset += len;
          return el;
        })}
      {centerValue && (
        <text x={c} y={c - 2} textAnchor="middle" fontSize="20" fontWeight="700" fill="#0f172a">
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text x={c} y={c + 14} textAnchor="middle" fontSize="10" fill="#94a3b8">
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

export function DonutLegend({ data }: { data: DonutSlice[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
            {d.label}
          </span>
          <span className="font-semibold text-slate-800">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400 ${className}`}>
      {children}
    </div>
  );
}
