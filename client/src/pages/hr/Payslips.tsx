import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import {
  payrollService,
  PayrollRecordItem,
  PayslipItem,
} from '../../services/payroll.service';
import toast from 'react-hot-toast';

export default function HrPayslipsPage() {
  const { user, logout } = useAuth();
  const [records, setRecords] = useState<PayrollRecordItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [payslipByRecord, setPayslipByRecord] = useState<Record<string, PayslipItem>>({});

  useEffect(() => {
    let mounted = true;
    payrollService
      .listPayrolls({ month: monthFilter ? Number(monthFilter) : undefined, year: yearFilter ? Number(yearFilter) : undefined })
      .then((result) => {
        if (!mounted) return;
        setRecords(result.payrolls);
      })
      .catch(() => {
        if (mounted) setError('Could not load payroll records.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFilter, yearFilter]);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'HR_ADMIN';

  const handleGenerate = async (record: PayrollRecordItem) => {
    setGeneratingId(record.id);
    try {
      const payslip = await payrollService.generatePayslip(record.id);
      setPayslipByRecord((current) => ({ ...current, [record.id]: payslip }));
      toast.success(`Payslip generated for ${record.month}/${record.year}.`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
        ?.message;
      toast.error(message || 'Could not generate the payslip.');
    } finally {
      setGeneratingId(null);
    }
  };

  const download = async (payslip: PayslipItem) => {
    try {
      await payrollService.downloadPayslipPDF(payslip.id, `payslip-${payslip.month}-${payslip.year}.pdf`);
      toast.success('Payslip downloaded.');
    } catch {
      toast.error('Could not download the payslip.');
    }
  };

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Payslips" subtitle="Salary slips for approved payroll runs" />
      <div className="p-8 max-w-6xl">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="month">
              Month
            </label>
            <input
              id="month"
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="number"
              min={1}
              max={12}
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="year">
              Year
            </label>
            <input
              id="year"
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="number"
              min={2000}
              max={2100}
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            />
          </div>
          {(monthFilter || yearFilter) && (
            <button
              onClick={() => {
                setMonthFilter('');
                setYearFilter('');
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Clear filters
            </button>
          )}
        </div>

        {isLoading ? (
          <p className="text-slate-500">Loading payroll records…</p>
        ) : records.length === 0 ? (
          <p className="text-slate-500">No payroll records for this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-500">Period</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-right">Net Pay</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Payslip</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const payslip = payslipByRecord[record.id];
                  return (
                    <tr key={record.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700">
                        {record.month}/{record.year}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {record.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">{record.netPay}</td>
                      <td className="px-4 py-3">
                        {payslip ? (
                          <>
                            <span className="mr-3 text-slate-600">
                              Available {payslip.month}/{payslip.year}
                            </span>
                            <button
                              onClick={() => download(payslip)}
                              className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              Download PDF
                            </button>
                          </>
                        ) : record.status === 'APPROVED' ? (
                          <button
                            onClick={() => handleGenerate(record)}
                            disabled={generatingId === record.id}
                            className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            {generatingId === record.id ? 'Generating…' : 'Generate Payslip'}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Not yet approved</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
