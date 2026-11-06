import { LucideIcon } from 'lucide-react';

export type KPITone = 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'slate';

const TONE_STYLES: Record<KPITone, { border: string; chip: string; value: string }> = {
  blue: { border: 'border-cyan-200/70', chip: 'bg-cyan-50 text-cyan-600', value: 'text-cyan-700' },
  green: { border: 'border-emerald-200/70', chip: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700' },
  purple: { border: 'border-violet-200/70', chip: 'bg-violet-50 text-violet-600', value: 'text-violet-700' },
  amber: { border: 'border-amber-200/70', chip: 'bg-amber-50 text-amber-600', value: 'text-amber-700' },
  red: { border: 'border-red-200/70', chip: 'bg-red-50 text-red-600', value: 'text-red-700' },
  slate: { border: 'border-slate-200', chip: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
};

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  tone?: KPITone;
  loading?: boolean;
}

/**
 * Compact KPI card: tinted icon chip, colored 1px border, big value + label.
 * Sized to sit 5-6 across on desktop in a single row.
 */
export default function KPICard({ label, value, sub, icon: Icon, tone = 'blue', loading }: KPICardProps) {
  const s = TONE_STYLES[tone];
  return (
    <div className={`rounded-2xl border ${s.border} bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]`}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${s.chip}`}>
          <Icon size={15} strokeWidth={2} />
        </span>
      </div>
      {loading ? (
        <p className="mt-2 text-xl font-bold text-slate-300">—</p>
      ) : (
        <p className={`mt-1 text-[26px] font-bold leading-none tracking-tight ${s.value}`}>{value}</p>
      )}
      {sub && <p className="mt-1.5 truncate text-[11px] font-medium text-slate-400">{sub}</p>}
    </div>
  );
}
