import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  FolderKanban,
  LifeBuoy,
  ShieldCheck,
  Briefcase,
  FileBarChart,
  FileText,
  Home,
  Hourglass,
  ListChecks,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
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

const TONES: Record<string, { chipBg: string; chipText: string; text: string }> = {
  blue: { chipBg: 'bg-cyan-50', chipText: 'text-cyan-600', text: 'text-slate-900' },
  green: { chipBg: 'bg-emerald-50', chipText: 'text-emerald-600', text: 'text-slate-900' },
  purple: { chipBg: 'bg-violet-50', chipText: 'text-violet-600', text: 'text-slate-900' },
  yellow: { chipBg: 'bg-amber-50', chipText: 'text-amber-600', text: 'text-slate-900' },
  red: { chipBg: 'bg-red-50', chipText: 'text-red-600', text: 'text-slate-900' },
  slate: { chipBg: 'bg-slate-100', chipText: 'text-slate-600', text: 'text-slate-900' },
};

const TONE_ICONS: Record<string, LucideIcon> = {
  blue: Clock3,
  green: ShieldCheck,
  purple: LifeBuoy,
  yellow: CalendarDays,
  red: Hourglass,
  slate: Briefcase,
};

const QUICK_ACTION_ICONS: Record<string, LucideIcon> = {
  leave: LifeBuoy,
  wfh: Home,
  payslip: FileText,
  holiday: CalendarDays,
  approve: ListChecks,
  payroll: CircleDollarSign,
  report: FileBarChart,
  employee: UserRound,
  department: FolderKanban,
  clock: Clock3,
  list: ListChecks,
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
    <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)] ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-[13px] font-semibold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ViewAll({ to, label = 'View All' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="rounded-lg px-1.5 py-1 text-xs font-semibold text-cyan-600 transition hover:text-cyan-700">
      {label} <ArrowUpRight className="inline h-3.5 w-3.5" aria-hidden="true" />
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
          <div key={i} className="h-36 animate-pulse rounded-2xl border border-slate-200/80 bg-slate-100/60" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => {
        const t = TONES[s.tone] ?? TONES.slate;
        const Icon = TONE_ICONS[s.tone] ?? TONE_ICONS.slate;
        const inner = (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <div className="flex items-start justify-between gap-3">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t.chipBg}`}>
                <Icon className={`h-4 w-4 ${t.chipText}`} aria-hidden="true" />
              </span>
            </div>
            <p className={`mt-3 text-[26px] font-bold leading-8 tracking-tight ${t.text}`}>{s.value}</p>
            {s.trend && (
              <span
                className={`mt-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                  s.trend.tone === 'up' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' : 'bg-red-50 text-red-700 ring-red-200/60'
                }`}
              >
                {s.trend.tone === 'up' ? (
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                )}
                {s.trend.label}
              </span>
            )}
            {s.subLabel && !s.trend && <p className="mt-2 text-[11px] text-slate-400">{s.subLabel}</p>}
            {s.available === false && (
              <p className="mt-2 text-[11px] text-slate-400">Module not configured in this deployment</p>
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
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200/70',
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  Rejected: 'bg-red-50 text-red-700 ring-red-200/70',
  Present: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  Absent: 'bg-red-50 text-red-700 ring-red-200/70',
  Late: 'bg-amber-50 text-amber-700 ring-amber-200/70',
  'On Leave': 'bg-cyan-50 text-cyan-700 ring-cyan-200/70',
  WFH: 'bg-cyan-50 text-cyan-700 ring-cyan-200/70',
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        STATUS_STYLES[status] ?? 'bg-slate-50 text-slate-600 ring-slate-200/70'
      }`}
    >
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
  const dot: Record<string, string> = { Present: 'bg-emerald-500', Absent: 'bg-red-500', Late: 'bg-amber-500', WFH: 'bg-purple-500' };
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
  const dot: Record<string, string> = { Present: 'bg-emerald-500', Absent: 'bg-red-500', Late: 'bg-amber-500', 'On Leave': 'bg-blue-500' };
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

function formatHolidayDate(raw: string): string {
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return raw;
  }
}

export function HolidayList({ rows }: { rows: HolidayRow[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="grid h-9 shrink-0 place-items-center rounded-lg bg-cyan-50 px-2 text-center text-[10px] font-bold leading-tight text-cyan-700">
            {formatHolidayDate(r.date)}
          </span>
          <span className="min-w-0 flex-1 text-slate-700">{r.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function NotificationList({ rows }: { rows: NotificationRow[] }) {
  const dot = ['bg-cyan-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500'];
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
  const iconFor = (label: string): LucideIcon => {
    const normalized = label.toLowerCase();
    for (const [key, Icon] of Object.entries(QUICK_ACTION_ICONS)) {
      if (normalized.includes(key)) return Icon;
    }
    return ListChecks;
  };
  return (
    <div className="grid grid-cols-2 gap-4">
      {actions.map((a) => {
        const t = TONES[a.tone] ?? TONES.slate;
        const Icon = iconFor(a.label);
        return (
          <Link
            key={a.label}
            to={a.to}
            className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)] transition duration-200 hover:border-slate-300"
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t.chipBg}`}>
              <Icon className={`h-4 w-4 ${t.chipText}`} aria-hidden="true" />
            </span>
            <span className="truncate text-[13px] font-medium text-slate-700 group-hover:text-slate-900">{a.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
