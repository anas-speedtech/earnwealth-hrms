import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { compoffService } from '../../services/compoff.service';
import { leaveService } from '../../services/leave.service';
import { payrollService, type PayrollDashboardStats, type StatutoryDeductionReport } from '../../services/payroll.service';
import { wfhService } from '../../services/wfh.service';
import {
  Panel,
  StatGrid,
} from '../../components/dashboard/widgets';

export default function HrReportsPage() {
  const { user, logout } = useAuth();
  const [pendingLeaves, setPendingLeaves] = useState<number | null>(null);
  const [pendingWfhs, setPendingWfhs] = useState<number | null>(null);
  const [pendingCredits, setPendingCredits] = useState<number | null>(null);
  const [payrollStats, setPayrollStats] = useState<PayrollDashboardStats | null>(null);
  const [approvedPayroll, setApprovedPayroll] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // PF / ESIC deduction report period (defaults to the current month).
  const now = new Date();
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [statutory, setStatutory] = useState<StatutoryDeductionReport | null>(null);
  const [statutoryLoading, setStatutoryLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      leaveService.getPendingRequests().then((requests) => requests.length).catch(() => null),
      wfhService.listPending().then((requests) => requests.length).catch(() => null),
      compoffService.listPendingCredits().then((credits) => credits.length).catch(() => null),
      payrollService.getDashboardStats().then((stats) => {
        setApprovedPayroll(stats.approvedThisMonth);
        return stats;
      }),
    ])
      .then(([leaves, wfhs, credits, stats]) => {
        if (!mounted) return;
        setPendingLeaves(leaves);
        setPendingWfhs(wfhs);
        setPendingCredits(credits);
        setPayrollStats(stats);
      })
      .catch(() => {
        if (mounted) setError('Could not load the reports.');
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the PF / ESIC breakdown for the selected period.
  useEffect(() => {
    let mounted = true;
    setStatutoryLoading(true);
    payrollService
      .getStatutoryDeductionReport(reportMonth, reportYear)
      .then((report) => {
        if (mounted) setStatutory(report);
      })
      .catch(() => {
        if (mounted) setStatutory(null);
      })
      .finally(() => {
        if (mounted) setStatutoryLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [reportMonth, reportYear]);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'HR_ADMIN';

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Reports" subtitle="Reporting for HR operations" />
      <div className="p-6 max-w-7xl">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-600/10">{error}</p>}
        <div className="space-y-6">
          <StatGrid
            stats={[
              {
                key: 'pendingLeaves',
                label: 'Pending Leave Requests',
                value: pendingLeaves ?? 0,
                available: pendingLeaves !== null,
                href: '/hr/leaves',
                tone: 'yellow',
              },
              {
                key: 'pendingWfhs',
                label: 'Pending WFH Requests',
                value: pendingWfhs ?? 0,
                available: pendingWfhs !== null,
                href: '/hr/wfh',
                tone: 'purple',
              },
              {
                key: 'pendingCredits',
                label: 'Pending Comp-Off Reviews',
                value: pendingCredits ?? 0,
                available: pendingCredits !== null,
                href: '/hr/comp-offs',
                tone: 'green',
              },
              {
                key: 'approvedPayroll',
                label: 'Approved This Month',
                value: approvedPayroll ?? 0,
                available: payrollStats !== null,
                href: '/hr/payroll',
                tone: 'blue',
              },
            ]}
            loading={false}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Payroll runs">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Salary structures in use</dt>
                  <dd className="font-medium text-slate-800">{payrollStats?.totalSalaryStructures ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Payroll runs awaiting approval</dt>
                  <dd className="font-medium text-slate-800">{payrollStats?.pendingApproval ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Payroll runs approved this month</dt>
                  <dd className="font-medium text-slate-800">{payrollStats?.approvedThisMonth ?? 0}</dd>
                </div>
              </dl>
            </Panel>
            <Panel title="Approvals awaiting action">
              <p className="text-[13px] text-slate-500">
                The counts above come from the live queues. Open the Approvals pages for the
                pending leave requests, WFH requests and comp-off reviews.
              </p>
            </Panel>
          </div>

          <Panel>
            <div className="mb-4 flex flex-wrap items-end gap-4">
              <div>
                <h2 className="text-[13px] font-semibold text-slate-900">PF / ESIC Deduction Report</h2>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  Statutory components across approved and pending payroll records for the selected month.
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select
                  value={reportMonth}
                  onChange={(e) => setReportMonth(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 shadow-sm outline-none focus:border-cyan-500"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>{name}</option>
                  ))}
                </select>
                <select
                  value={reportYear}
                  onChange={(e) => setReportYear(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 shadow-sm outline-none focus:border-cyan-500"
                >
                  {Array.from({ length: 3 }, (_, i) => now.getFullYear() - 1 + i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => exportStatutoryCsv(statutory)}
                  disabled={!statutory || statutory.employees.length === 0}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Export CSV
                </button>
              </div>
            </div>

            {statutoryLoading ? (
              <p className="py-6 text-center text-[13px] text-slate-500">Loading statutory report…</p>
            ) : !statutory || statutory.employees.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-slate-500">
                No PF / ESIC components recorded for {MONTH_NAMES[reportMonth - 1]} {reportYear}.
                Statutory lines appear once a payroll run with PF / ESIC settings is submitted or approved.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">Employee</th>
                      <th className="px-3 py-2.5 text-right">PF (Employee)</th>
                      <th className="px-3 py-2.5 text-right">ESI (Employee)</th>
                      <th className="px-3 py-2.5 text-right">PF (Employer)</th>
                      <th className="px-3 py-2.5 text-right">ESI (Employer)</th>
                      <th className="px-3 py-2.5 text-right">Total Deduction</th>
                      <th className="px-3 py-2.5 text-right">Total Employer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statutory.employees.map((row) => (
                      <tr key={row.employeeId} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-slate-800">{row.employeeName || '—'}</div>
                          <div className="text-[11px] text-slate-400">{row.employeeCode}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{formatMoney(row.pfEmployee)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{formatMoney(row.esiEmployee)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{formatMoney(row.pfEmployer)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">{formatMoney(row.esiEmployer)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatMoney(row.totalDeduction)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatMoney(row.totalEmployer)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 text-[13px] font-semibold text-slate-900">
                    <tr>
                      <td className="px-3 py-2.5">Totals</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(statutory.totals.pfEmployee)}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(statutory.totals.esiEmployee)}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(statutory.totals.pfEmployer)}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(statutory.totals.esiEmployer)}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(statutory.totals.totalDeductions)}</td>
                      <td className="px-3 py-2.5 text-right">{formatMoney(statutory.totals.totalEmployer)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </DashboardShell>
  );
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMoney(value: number | string): string {
  const n = Number(value) || 0;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A simple CSV of the statutory breakdown — opens in Excel, or attach to a
// PF / ESIC filing pack.
function exportStatutoryCsv(report: StatutoryDeductionReport | null) {
  if (!report) return;
  const header = ['Employee Code', 'Employee Name', 'PF (Employee)', 'ESI (Employee)', 'PF (Employer)', 'ESI (Employer)', 'Total Deduction', 'Total Employer'];
  const lines = [header.join(',')];
  for (const row of report.employees) {
    lines.push([
      row.employeeCode,
      `"${String(row.employeeName || '').replace(/"/g, '""')}"`,
      row.pfEmployee,
      row.esiEmployee,
      row.pfEmployer,
      row.esiEmployer,
      row.totalDeduction,
      row.totalEmployer,
    ].join(','));
  }
  const t = report.totals;
  lines.push(['Totals', `""`, t.pfEmployee, t.esiEmployee, t.pfEmployer, t.esiEmployer, t.totalDeductions, t.totalEmployer].join(','));

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pf-esic-report-${report.year}-${String(report.month).padStart(2, '0')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
