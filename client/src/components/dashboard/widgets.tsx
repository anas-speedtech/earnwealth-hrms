import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, BarLegend, DonutChart, DonutLegend, type BarGroup, type DonutSlice } from './charts';

export type { DonutSlice };

// Types used by the dashboard panels. They describe the live data returned by
// the backend endpoints; nothing here is sample data.

export interface ActivityRow {
  date: string;
  activity: string;
  user: string;
}

export interface AttendanceDay {
  day: string;
  status: 'Present' | 'Absent' | 'Late' | 'WFH';
  time: string;
}

export interface HolidayRow {
  date: string;
  name: string;
}

export interface NotificationRow {
  text: string;
  age: string;
}

/* ---------------------------------------------------------------------------
 * Shared widgets used by all four role dashboards so every role renders the
 * same visual language (panels, tinted stat cards, status chips, lists).
 * ------------------------------------------------------------------------- */

const TONES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100', icon: 'bg-blue-100' },
  green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-100', icon: 'bg-green-100' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100', icon: 'bg-purple-100' },
  yellow: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100', icon: 'bg-amber-100' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100', icon: 'bg-red-100' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', icon: 'bg-slate-200' },
};

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-sm font-bold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ViewAll({ to, label = 'View All' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="text-xs font-medium text-primary-600 hover:underline">
      {label}
    </Link>
  );
}

export interface TitledStat {
  key: string;
  label: string;
  value: number | string;
  /** e.g. { label: '+5%', tone: 'up' } - only up/down are drawn */
  trend?: { label: string; tone: 'up' | 'down' };
  tone: keyof typeof TONES;
  href?: string;
  available?: boolean;
  subLabel?: string;
}

export function StatGrid({ stats, loading }: { stats: TitledStat[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => {
        const t = TONES[s.tone] ?? TONES.slate;
        const inner = (
          <div className={`rounded-2xl border ${t.border} bg-white p-5 shadow-sm transition hover:shadow-md`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-500">{s.label}</p>
                <p className={`mt-2 text-3xl font-bold ${t.text}`}>{s.value}</p>
              </div>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.icon} ${t.text}`}>
                <span className="h-2.5 w-2.5 rounded-md bg-current opacity-80" />
              </span>
            </div>
            {s.trend && (
              <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${s.trend.tone === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                <span>{s.trend.tone === 'up' ? '↑' : '↓'}</span>
                {s.trend.label}
              </p>
            )}
            {s.subLabel && !s.trend && <p className="mt-2 text-xs text-slate-400">{s.subLabel}</p>}
            {s.available === false && (
              <p className="mt-2 text-xs text-slate-400">Module not configured in this deployment</p>
            )}
          </div>
        );
        return s.href ? (
          <Link key={s.key} to={s.href} className="block">
            {inner}
          </Link>
        ) : (
          <div key={s.key}>{inner}</div>
        );
      })}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700',
  Approved: 'bg-green-50 text-green-700',
  Rejected: 'bg-red-50 text-red-700',
  Present: 'bg-green-50 text-green-700',
  Absent: 'bg-red-50 text-red-700',
  Late: 'bg-amber-50 text-amber-700',
  'On Leave': 'bg-blue-50 text-blue-700',
  WFH: 'bg-purple-50 text-purple-700',
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

export function AttendanceBar({ data, colors = ['#10b981', '#f87171'] as [string, string] }: { data: BarGroup[]; colors?: [string, string] }) {
  return (
    <div>
      <BarChart data={data as BarGroup[]} colors={colors} height={210} />
      <div className="mt-2 flex justify-end">
        <BarLegend items={[{ label: 'Present', color: colors[0] }, { label: 'Absent', color: colors[1] }]} />
      </div>
    </div>
  );
}

export function DonutPanel({ data, centerValue, centerLabel }: { data: DonutSlice[]; centerValue: string; centerLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <DonutChart data={data} centerValue={centerValue} centerLabel={centerLabel} />
      <div className="w-full">
        <DonutLegend data={data} />
      </div>
    </div>
  );
}

export function ActivityTable({ rows, columns }: { rows: ActivityRow[]; columns: [string, 'activity' | 'user' | 'date'][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-medium text-slate-400">
          <th className="pb-2 font-medium">Date</th>
          {columns.map(([label]) => (
            <th key={label} className="pb-2 font-medium">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="py-2.5 pr-2 text-xs text-slate-400">{r.date}</td>
            {columns.map(([, key]) => (
              <td key={key} className="py-2.5 pr-2 text-slate-700">
                {r[key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LeaveTable({ rows }: { rows: { employee: string; type: string; dates: string; status: string }[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-medium text-slate-400">
          <th className="pb-2 font-medium">Employee</th>
          <th className="pb-2 font-medium">Leave Type</th>
          <th className="pb-2 font-medium">Dates</th>
          <th className="pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="py-2.5 pr-2 font-medium text-slate-700">{r.employee}</td>
            <td className="py-2.5 pr-2 text-slate-600">{r.type}</td>
            <td className="py-2.5 pr-2 text-slate-600">{r.dates}</td>
            <td className="py-2.5">
              <StatusChip status={r.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AttendanceList({ rows }: { rows: AttendanceDay[] }) {
  const dot: Record<string, string> = { Present: 'bg-green-500', Absent: 'bg-red-500', Late: 'bg-amber-500', WFH: 'bg-purple-500' };
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center justify-between py-2.5 text-sm">
          <div className="flex items-center gap-2.5">
            <span className={`h-2 w-2 rounded-full ${dot[r.status] ?? 'bg-slate-400'}`} />
            <span className="text-slate-700">{r.day}</span>
          </div>
          <div className="flex items-center gap-3">
            <StatusChip status={r.status} />
            <span className="hidden w-36 text-right text-xs text-slate-400 sm:block">{r.time}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StatusSummary({ counts }: { counts: Record<string, number> }) {
  const dot: Record<string, string> = { Present: 'bg-green-500', Absent: 'bg-red-500', Late: 'bg-amber-500', 'On Leave': 'bg-blue-500' };
  return (
    <ul className="divide-y divide-slate-100">
      {Object.entries(counts).map(([label, value]) => (
        <li key={label} className="flex items-center justify-between py-2.5 text-sm">
          <span className="inline-flex items-center gap-2.5 text-slate-700">
            <span className={`h-2 w-2 rounded-full ${dot[label] ?? 'bg-slate-400'}`} />
            {label}
          </span>
          <span className="font-semibold text-slate-800">{value}</span>
        </li>
      ))}
    </ul>
  );
}

export function HolidayList({ rows }: { rows: HolidayRow[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="grid h-8 w-11 shrink-0 place-items-center rounded-lg bg-primary-50 px-1 text-center text-[10px] font-bold leading-tight text-primary-700">
            {r.date}
          </span>
          <span className="text-slate-700">{r.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function NotificationList({ rows }: { rows: NotificationRow[] }) {
  const dot = ['bg-primary-500', 'bg-purple-500', 'bg-amber-500', 'bg-green-500'];
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r, i) => (
        <li key={i} className="flex gap-2.5 py-2.5 text-sm">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[i % dot.length]}`} />
          <div className="min-w-0">
            <p className="text-slate-700">{r.text}</p>
            <p className="mt-0.5 text-xs text-slate-400">{r.age}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function QuickActions({ actions }: { actions: { label: string; to: string; tone: keyof typeof TONES }[] }) {
  return (
    <div className="grid gap-2.5">
      {actions.map((a) => {
        const t = TONES[a.tone] ?? TONES.slate;
        return (
          <Link
            key={a.label}
            to={a.to}
            className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-medium text-slate-700 transition hover:border-primary-300 hover:bg-primary-50"
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${t.icon} ${t.text}`}>
              <span className="h-2.5 w-2.5 rounded-md bg-current opacity-80" />
            </span>
            {a.label}
            <span className="ml-auto text-slate-300">→</span>
          </Link>
        );
      })}
    </div>
  );
}
