import { LucideIcon } from 'lucide-react';

export type StatusBadgeTone =
  | 'green'
  | 'amber'
  | 'red'
  | 'blue'
  | 'purple'
  | 'slate'
  | 'emerald';

const TONES: Record<StatusBadgeTone, string> = {
  green: 'bg-green-50 text-green-700 ring-green-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const DOTS: Record<StatusBadgeTone, string> = {
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-sky-500',
  purple: 'bg-purple-500',
  slate: 'bg-slate-400',
};

interface StatusBadgeProps {
  children: string;
  tone?: StatusBadgeTone;
  dot?: boolean;
  icon?: LucideIcon;
}

/** Small pill tag: 1px ring + tinted bg + optional leading dot or icon. */
export default function StatusBadge({ children, tone = 'slate', dot = false, icon: Icon }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} />}
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
}
