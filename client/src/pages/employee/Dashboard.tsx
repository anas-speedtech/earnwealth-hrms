import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, FileText, Hourglass, type LucideIcon } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveBalanceItem } from '../../services/leave.service';
import { payrollService, PayslipItem } from '../../services/payroll.service';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

export default function EmployeeDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalanceItem[]>([]);
  const [latestPayslip, setLatestPayslip] = useState<PayslipItem | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Live data for the summary tiles.
  useEffect(() => {
    let mounted = true;
    leaveService.getMyBalances()
      .then((rows) => { if (mounted) setLeaveBalances(rows); })
      .catch(() => {});
    payrollService.listMyPayslips()
      .then((result) => { if (mounted) setLatestPayslip(result.payslips?.[0] ?? null); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Employee';

  const handleDownloadPayslip = async () => {
    if (!latestPayslip) {
      navigate('/employee/payslips');
      return;
    }
    setDownloading(true);
    try {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const employeeId = latestPayslip.payroll?.employeeId || latestPayslip.id.slice(0, 8);
      const filename = `Payslip-${employeeId}-${monthNames[(latestPayslip.month ?? 1) - 1]}-${latestPayslip.year}.pdf`;
      await payrollService.downloadPayslipPDF(latestPayslip.id, filename);
      toast.success('Payslip downloaded successfully.');
    } catch {
      // error toast shown in service
    } finally {
      setDownloading(false);
    }
  };

  // Leave balance broken down by type, e.g. "Sick 2 · Casual 4 · Earned 12".
  // Only types configured for this employee are shown (the `configured` flag
  // = a leave_balances row exists for them); the rest are omitted so, e.g.,
  // an employee without maternity leave doesn't see it.
  const configuredLeaves = leaveBalances.filter(
    (b) => Number(b.configured || 0) === 1 || Number(b.hasBalance || 0) === 1,
  );
  const leaveItems = configuredLeaves.map((b) => ({
    label: b.displayName || b.name,
    value: Math.max(0, Number(b.availableBalance || 0)),
  }));

  return (
    <DashboardShell role="EMPLOYEE" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Employee Dashboard" subtitle="Your workday, all in one place." />
      <div className="mx-auto max-w-7xl px-5 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-slate-500">Welcome back, <span className="font-semibold text-slate-700">{displayName.split(' ')[0]}</span>.</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Here's a clear view of your workplace today.</p>
          </div>
          <div className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700">Personal workspace</div>
        </div>

        {/* My Summary — four tiles, PayBook style */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            icon={Hourglass}
            tone="yellow"
            label="Leave"
            items={leaveItems}
            fallback={configuredLeaves.length ? 'No days left' : 'No leave types yet'}
            sub="Available days by type"
            actionLabel="Apply"
            to="/employee/leaves/apply"
          />
          <SummaryTile
            icon={FileText}
            tone="green"
            label="Payslips"
            value={latestPayslip ? `${monthName(latestPayslip.month)} ${latestPayslip.year}` : '—'}
            sub={latestPayslip?.payroll ? `Net ₹${Number(latestPayslip.payroll.netPay || 0).toLocaleString('en-IN')}` : 'View & download your payslips'}
            actionLabel="Download PDF"
            onAction={latestPayslip ? handleDownloadPayslip : undefined}
            to="/employee/payslips"
            busy={downloading}
          />
          <SummaryTile
            icon={CalendarDays}
            tone="purple"
            label="Attendance"
            value="Calendar"
            sub="Click a day to apply punch-in / punch-out"
            actionLabel="Open"
            to="/employee/attendance"
          />
        </div>
      </div>
    </DashboardShell>
  );
}

// ---- "My Summary" quick tile (PayBook style) ----

const TILE_TONES: Record<string, { bg: string; text: string }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  blue: { bg: 'bg-cyan-50', text: 'text-cyan-600' },
  purple: { bg: 'bg-violet-50', text: 'text-violet-600' },
  yellow: { bg: 'bg-amber-50', text: 'text-amber-600' },
};

function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
  items,
  fallback,
  sub,
  actionLabel,
  onAction,
  to,
  busy,
}: {
  icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  label: string;
  value?: string | number;
  /** When provided, render as a small stacked list instead of a single value. */
  items?: { label: string; value: string | number }[];
  fallback?: string;
  sub?: string;
  actionLabel?: string;
  onAction?: () => void;
  to?: string;
  busy?: boolean;
}) {
  const t = TILE_TONES[tone] ?? TILE_TONES.blue;
  const hasAction = actionLabel && (onAction || to);
  const showItems = Array.isArray(items) && items.length > 0;
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.bg}`}>
          <Icon className={`h-5 w-5 ${t.text}`} aria-hidden="true" />
        </span>
        {to && (
          <Link to={to} className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-700">
            Open
          </Link>
        )}
      </div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>

      {showItems ? (
        <ul className="mt-2 space-y-1">
          {items.map((it) => (
            <li key={it.label} className="flex items-center justify-between text-[13px]">
              <span className="truncate text-slate-600">{it.label}</span>
              <span className="ml-2 font-semibold text-slate-900">{it.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[20px] font-bold leading-6 text-slate-900 break-words">
          {value !== undefined ? value : (fallback ?? '—')}
        </p>
      )}
      {sub && <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{sub}</p>}

      <div className="mt-auto pt-3">
        {hasAction && (
          <div className="flex gap-2">
            {actionLabel && to && (
              <Link
                to={to}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-slate-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> {actionLabel}
              </Link>
            )}
            {actionLabel && onAction && (
              <button
                onClick={onAction}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-50"
              >
                <FileText className="h-3.5 w-3.5" /> {busy ? 'Preparing…' : actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function monthName(month: number | null | undefined): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (month && names[month - 1]) || 'Latest';
}
