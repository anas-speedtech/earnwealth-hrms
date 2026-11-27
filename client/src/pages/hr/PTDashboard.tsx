import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, FileDown, ShieldCheck, X } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import {
  payrollService,
  PTDashboard,
  PTFilingRow,
  PTExemptionRow,
  PTMonthlyEmployeeRow,
  PTMonthlyStateRow,
  PTFiscalEmployeeRow,
  PTReconciliation,
} from '../../services/payroll.service';
import { formatCurrency } from '../../utils/formatters';
import toast from 'react-hot-toast';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CARD = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';
const SELECT =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 shadow-sm outline-none focus:border-cyan-500';
const BTN =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50';

type ReportKey = 'monthly-employee' | 'monthly-state' | 'fiscal-employee' | 'reconciliation' | 'exemptions' | 'compliance';

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'monthly-employee', label: 'Monthly · employee-wise' },
  { key: 'monthly-state', label: 'Monthly · state-wise' },
  { key: 'fiscal-employee', label: 'FY · employee-wise' },
  { key: 'reconciliation', label: 'Deduction vs payment' },
  { key: 'exemptions', label: 'Exemptions' },
  { key: 'compliance', label: 'Employer compliance' },
];

export default function PTDashboardPage() {
  const { user, logout } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [stateCode, setStateCode] = useState('MH');

  const [dash, setDash] = useState<PTDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const [report, setReport] = useState<ReportKey>('monthly-employee');
  const [reportRows, setReportRows] = useState<unknown[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const [exemptions, setExemptions] = useState<PTExemptionRow[]>([]);
  const [filings, setFilings] = useState<PTFilingRow[]>([]);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'HR';

  const loadDash = useCallback(async () => {
    setLoading(true);
    try {
      setDash(await payrollService.getPTDashboard({ stateCode: stateCode || undefined, month, year }));
    } catch {
      setDash(null);
    } finally {
      setLoading(false);
    }
  }, [stateCode, month, year]);

  useEffect(() => { loadDash(); }, [loadDash]);

  // Report data (each report returns a plain array; rendered generically below).
  useEffect(() => {
    let mounted = true;
    setReportLoading(true);
    const stateParam = stateCode || undefined;
    const p = (() => {
      switch (report) {
        case 'monthly-employee':
          return payrollService.getPTMonthlyEmployeeReport({ stateCode: stateParam, month, year }).then((r) => r as unknown[]);
        case 'monthly-state':
          return payrollService.getPTMonthlyStateReport({ month, year }).then((r) => r as unknown[]);
        case 'fiscal-employee':
          return payrollService.getPTFiscalYearEmployeeReport({ fiscalYearStart: fiscalYearStartFor(month, year), stateCode: stateParam }).then((r) => r as unknown[]);
        case 'reconciliation':
          return payrollService.getPTReconciliationReport({ stateCode: stateParam, fiscalYearStart: fiscalYearStartFor(month, year) }).then((r) => r as unknown[]);
        case 'exemptions':
          return payrollService.getPTExemptions().then((r) => r as unknown[]);
        case 'compliance':
          return payrollService.getPTComplianceReport().then((r) => r as unknown[]);
      }
    })();
    p.then((rows) => { if (mounted) setReportRows(rows); })
      .catch(() => { if (mounted) setReportRows([]); })
      .finally(() => { if (mounted) setReportLoading(false); });
    return () => { mounted = false; };
  }, [report, stateCode, month, year]);

  // Exemption queue + compliance ledger.
  useEffect(() => {
    let mounted = true;
    payrollService.listPTExemptions().then((rows) => { if (mounted) setExemptions(rows); }).catch(() => {});
    payrollService.listPTFilings().then((rows) => { if (mounted) setFilings(rows); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const reviewExemption = async (row: PTExemptionRow, approved: boolean) => {
    try {
      await payrollService.reviewPTExemption({ employeeId: row.employeeId, approved });
      toast.success(approved ? `Exemption approved for ${row.employeeCode || row.name}.` : `Exemption rejected.`);
      setExemptions(await payrollService.listPTExemptions());
      loadDash();
    } catch {
      toast.error('Could not review the exemption.');
    }
  };

  const reportColumns = useMemo(() => {
    switch (report) {
      case 'monthly-employee':
        return ['Employee', 'State', 'Category', 'Taxable basis', 'Normal PT', 'Feb adj.', 'Exemption', 'Final PT', 'Exempt'];
      case 'monthly-state':
        return ['State', 'Final PT', 'Employees', 'Exempt'];
      case 'fiscal-employee':
        return ['Employee', 'State', 'Total PT', 'Total exemption', 'Months'];
      case 'reconciliation':
        return ['State', 'FY start', 'Payable', 'Paid', 'Outstanding', 'Filing status'];
      case 'exemptions':
        return ['Employee', 'State', 'Category', 'Status', 'Valid from', 'Valid until', 'Provision'];
      case 'compliance':
        return ['State', 'FY', 'Frequency', 'Basis liability', 'Payable', 'Paid', 'Outstanding', 'Status', 'Next deadline'];
    }
  }, [report]);

  // CSV export of the currently selected report.
  const exportReportCsv = () => {
    const lines = [reportColumns.join(',')];
    for (const row of reportRows as Record<string, unknown>[]) {
      lines.push(Object.values(row).map((v) => (v == null ? '' : String(v).replace(/"/g, '""'))).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pt-${report}-${year}-${String(month).padStart(2, '0')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Focused table rendering for the structured reports (typed rows).
  const renderReportTable = () => {
    if (reportLoading) return <p className="py-6 text-center text-[13px] text-slate-500">Loading report…</p>;
    if (!reportRows.length) return <p className="py-6 text-center text-[13px] text-slate-500">No records for this report yet.</p>;
    switch (report) {
      case 'monthly-employee':
        return (
          <>
          <TableHead cols={['Employee', 'State', 'Basis', 'Normal PT', 'Feb adj.', 'Exempt amt', 'Final PT', 'Exempt']} />
          <tbody>{(reportRows as PTMonthlyEmployeeRow[]).map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className="px-3 py-2.5"><div className="font-medium text-slate-800">{r.employeeName || '—'}</div><div className="text-[11px] text-slate-400">{r.employeeCode}</div></td>
              <td className="px-3 py-2.5 text-slate-600">{r.stateCode || '—'}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatCurrency(r.taxableBasis)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatCurrency(r.normalPT)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatCurrency(r.februaryAdjustment)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatCurrency(r.exemption)}</td>
              <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatCurrency(r.finalPT)}</td>
              <td className="px-3 py-2.5">{r.isExempt ? <ShieldCheck size={14} className="text-emerald-600" /> : '—'}</td>
            </tr>
          ))}</tbody>
          </>
        );
      case 'monthly-state':
        return (
          <>
          <TableHead cols={['State', 'Final PT', 'Employees', 'Exempt']} />
          <tbody>{(reportRows as PTMonthlyStateRow[]).map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className="px-3 py-2.5 font-medium text-slate-800">{r.stateCode}</td>
              <td className="px-3 py-2.5 text-right text-slate-900">{formatCurrency(r.finalPT)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{r.employeeCount}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{r.exemptCount}</td>
            </tr>
          ))}</tbody>
          </>
        );
      case 'fiscal-employee':
        return (
          <>
          <TableHead cols={['Employee', 'State', 'Total PT', 'Exemption', 'Months']} />
          <tbody>{(reportRows as PTFiscalEmployeeRow[]).map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className="px-3 py-2.5"><div className="font-medium text-slate-800">{r.employeeName || '—'}</div><div className="text-[11px] text-slate-400">{r.employeeCode}</div></td>
              <td className="px-3 py-2.5 text-slate-600">{r.stateCode || '—'}</td>
              <td className="px-3 py-2.5 text-right text-slate-900">{formatCurrency(r.totalPT)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatCurrency(r.totalExemption)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{r.months}</td>
            </tr>
          ))}</tbody>
          </>
        );
      case 'reconciliation':
        return (
          <>
          <TableHead cols={['State', 'FY start', 'Payable', 'Paid', 'Outstanding', 'Filing status']} />
          <tbody>{(reportRows as PTReconciliation[]).map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className="px-3 py-2.5 font-medium text-slate-800">{r.stateCode}</td>
              <td className="px-3 py-2.5 text-slate-600">{r.fiscalYearStart}</td>
              <td className="px-3 py-2.5 text-right text-slate-900">{formatCurrency(r.totalPayable)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatCurrency(r.totalPaid)}</td>
              <td className={`px-3 py-2.5 text-right font-medium ${r.outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(r.outstanding)}</td>
              <td className="px-3 py-2.5 text-slate-700">{r.filingStatus}</td>
            </tr>
          ))}</tbody>
          </>
        );
      case 'exemptions':
        return (
          <>
          <TableHead cols={['Employee', 'State', 'Category', 'Status', 'Valid from', 'Valid until', 'Provision']} />
          <tbody>{(reportRows as PTExemptionRow[]).map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className="px-3 py-2.5"><div className="font-medium text-slate-800">{r.name || '—'}</div><div className="text-[11px] text-slate-400">{r.employeeCode}</div></td>
              <td className="px-3 py-2.5 text-slate-600">{r.stateCode || '—'}</td>
              <td className="px-3 py-2.5 text-slate-700">{r.category || '—'}</td>
              <td className="px-3 py-2.5"><StatusChip value={r.status} /></td>
              <td className="px-3 py-2.5 text-slate-700">{r.validFrom ? String(r.validFrom).slice(0, 10) : '—'}</td>
              <td className="px-3 py-2.5 text-slate-700">{r.validUntil ? String(r.validUntil).slice(0, 10) : '—'}</td>
              <td className="px-3 py-2.5 text-slate-700">{r.provision || '—'}</td>
            </tr>
          ))}</tbody>
          </>
        );
      case 'compliance':
        return (
          <>
          <TableHead cols={['State', 'FY', 'Frequency', 'Payable', 'Paid', 'Outstanding', 'Status', 'Next deadline']} />
          <tbody>{(reportRows as PTFilingRow[]).map((r, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className="px-3 py-2.5 font-medium text-slate-800">{r.stateCode}</td>
              <td className="px-3 py-2.5 text-slate-600">{r.financialYear}</td>
              <td className="px-3 py-2.5 text-slate-700">{r.frequency}</td>
              <td className="px-3 py-2.5 text-right text-slate-900">{formatCurrency(r.payable)}</td>
              <td className="px-3 py-2.5 text-right text-slate-700">{formatCurrency(r.paid)}</td>
              <td className={`px-3 py-2.5 text-right font-medium ${r.outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(r.outstanding)}</td>
              <td className="px-3 py-2.5"><StatusChip value={r.status} /></td>
              <td className="px-3 py-2.5 text-slate-700">{r.nextDeadline ? String(r.nextDeadline).slice(0, 10) : '—'}</td>
            </tr>
          ))}</tbody>
          </>
        );
    }
  };

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Professional Tax" subtitle="State- & category-specific PT dashboard, reports and employer compliance" />
      <div className="mx-auto max-w-7xl p-6">
        <div className="space-y-5">
          {/* Period / state selector */}
          <div className={`flex flex-wrap items-end gap-4 p-5 ${CARD}`}>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-slate-600">Month</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={SELECT}>
                {MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-slate-600">Year</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={SELECT}>
                {Array.from({ length: 3 }, (_, i) => now.getFullYear() - 1 + i).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-slate-600">State</label>
              <input value={stateCode} onChange={(e) => setStateCode(e.target.value.toUpperCase().slice(0, 10))} className="h-[30px] w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-mono outline-none focus:border-cyan-500" placeholder="MH" />
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              {REPORTS.map((r) => (
                <button key={r.key} onClick={() => setReport(r.key)}
                  className={`${BTN} ${report === r.key ? '!bg-cyan-600 !text-white !border-cyan-600' : ''}`}>
                  {r.label}
                </button>
              ))}
              <button onClick={exportReportCsv} disabled={reportLoading || !reportRows.length} className={`${BTN} !bg-slate-900 !text-white !border-slate-900 disabled:opacity-50`}>
                <FileDown size={12} className="mr-1 inline" /> Export CSV
              </button>
            </div>
          </div>

          {/* Dashboard stat tiles */}
          {dash ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="PT deducted (month)" value={dash.currentMonth.totalPTDeducted} tone="blue" />
              <StatTile label="PT payable (employer)" value={dash.employer.totalPTPayable} tone="blue" sub={`Paid ${formatCurrency(dash.employer.totalPTPaid)}`} />
              <StatTile label="PT outstanding" value={dash.employer.outstanding} tone={dash.employer.outstanding > 0 ? 'red' : 'green'} sub={`Filing ${dash.employer.filingStatus}`} />
              <StatTile label="Feb adjustment / exempt" value={formatCurrency(dash.currentMonth.februaryAdjustment)} tone="purple"
                sub={`${dash.currentMonth.exemptEmployees} exempt · ${dash.currentMonth.employees} employees`} />
            </div>
          ) : (
            <div className={`p-5 ${CARD}`}><p className="text-[13px] text-slate-500">{loading ? 'Loading PT dashboard…' : 'No PT activity for the selected period.'}</p></div>
          )}

          {/* Employee-wise + state-wise (dashboard) */}
          {dash && (dash.employeeWise.length > 0 || dash.stateWise.length > 0) && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className={CARD}>
                <h3 className="mb-3 text-[14px] font-semibold text-slate-900">Employee-wise PT ({MONTH_NAMES[month - 1]} {year})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">State</th><th className="px-3 py-2 text-right">PT</th><th className="px-3 py-2 text-right">Exempt</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dash.employeeWise.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2"><div className="font-medium text-slate-800">{r.employeeName || '—'}</div><div className="text-[11px] text-slate-400">{r.employeeCode}</div></td>
                          <td className="px-3 py-2 text-slate-600">{r.stateCode || '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-900">{formatCurrency(r.finalPT)}</td>
                          <td className="px-3 py-2 text-right">{r.isExempt ? <ShieldCheck size={14} className="inline text-emerald-600" /> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className={CARD}>
                <h3 className="mb-3 text-[14px] font-semibold text-slate-900">State-wise PT</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <tr><th className="px-3 py-2">State</th><th className="px-3 py-2 text-right">Final PT</th><th className="px-3 py-2 text-right">Employees</th><th className="px-3 py-2 text-right">Exempt</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dash.stateWise.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-slate-800">{r.stateCode}</td>
                          <td className="px-3 py-2 text-right text-slate-900">{formatCurrency(r.finalPT)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{r.employeeCount}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{r.exempt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dash.upcomingDeadlines.length > 0 && (
                  <div className="mt-4 rounded-lg bg-amber-50 p-3 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-100">
                    <p className="font-semibold">Upcoming compliance deadlines</p>
                    {dash.upcomingDeadlines.map((d, i) => (
                      <p key={i} className="mt-1">{d.stateCode} · {d.type} due {d.deadline ? String(d.deadline).slice(0, 10) : '—'} · {d.status}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Selected report table */}
          <div className={CARD}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-slate-900">{REPORTS.find((r) => r.key === report)?.label} — report</h3>
              <span className="text-[11px] text-slate-400">{reportRows.length} rows</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">{renderReportTable()}</table>
            </div>
          </div>

          {/* Exemption review + compliance ledger */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className={CARD}>
              <h3 className="mb-1 text-[14px] font-semibold text-slate-900">PT Exemptions</h3>
              <p className="mb-3 text-[12px] text-slate-500">Only APPROVED exemptions inside their window affect payroll.</p>
              {exemptions.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-slate-400">No exemption records.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {exemptions.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-[13px] font-medium text-slate-800">{r.name || r.employeeCode || '—'}</p>
                        <p className="text-[11px] text-slate-400">{r.category || 'no category'} · {r.status || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => reviewExemption(r, true)} disabled={r.status === 'APPROVED'} className={BTN}><Check size={12} className="mr-1 inline" /> Approve</button>
                        <button onClick={() => reviewExemption(r, false)} disabled={r.status === 'REJECTED'} className={`${BTN} !text-red-600`}><X size={12} className="mr-1 inline" /> Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={CARD}>
              <h3 className="mb-1 text-[14px] font-semibold text-slate-900">Employer Filing Ledger</h3>
              <p className="mb-3 text-[12px] text-slate-500">Filing frequency auto-derives from the prior-FY PT liability (Rule 11).</p>
              {filings.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-slate-400">No filing rows yet. Upsert one from the compliance report.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <tr><th className="px-3 py-2">State</th><th className="px-3 py-2">FY</th><th className="px-3 py-2">Freq</th><th className="px-3 py-2 text-right">Outstanding</th><th className="px-3 py-2">Status</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filings.map((f, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-slate-800">{f.stateCode}</td>
                          <td className="px-3 py-2 text-slate-600">{f.financialYear}</td>
                          <td className="px-3 py-2 text-slate-700">{f.frequency}</td>
                          <td className={`px-3 py-2 text-right font-medium ${f.outstanding > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCurrency(f.outstanding)}</td>
                          <td className="px-3 py-2"><StatusChip value={f.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

// ---- small building blocks (kept local, matching the HR Reports conventions) ----

const TONES: Record<string, { chip: string; text: string }> = {
  blue: { chip: 'bg-cyan-50 text-cyan-600', text: 'text-slate-900' },
  green: { chip: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-600' },
  red: { chip: 'bg-red-50 text-red-600', text: 'text-red-600' },
  purple: { chip: 'bg-violet-50 text-violet-600', text: 'text-slate-900' },
};

function StatTile({ label, value, sub, tone = 'blue' }: { label: string; value: number | string; sub?: string; tone?: keyof typeof TONES }) {
  const t = TONES[tone] ?? TONES.blue;
  return (
    <div className={CARD}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-[24px] font-bold leading-7 ${t.text}`}>{typeof value === 'number' ? formatCurrency(value) : value}</p>
      {sub && <p className="mt-1 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      <tr>{cols.map((c) => <th key={c} className="px-3 py-2.5">{c}</th>)}</tr>
    </thead>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200/70',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200/70',
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
  FILED: 'bg-cyan-50 text-cyan-700 ring-cyan-200/70',
  LATE: 'bg-red-50 text-red-700 ring-red-200/70',
  NONE: 'bg-slate-100 text-slate-500 ring-slate-200/70',
};
function StatusChip({ value }: { value: string | null }) {
  const key = value || 'NONE';
  const cls = STATUS_STYLES[key] ?? STATUS_STYLES.NONE;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>{key}</span>;
}

function fiscalYearStartFor(month: number, year: number) {
  return month >= 4 ? year : year - 1;
}
