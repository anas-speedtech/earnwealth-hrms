import { useState, useEffect } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { payrollService, PayslipItem, PayrollRecordItem } from '../../services/payroll.service';
import toast from 'react-hot-toast';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function EmployeePayslipsPage() {
  const { user, logout } = useAuth();
  const [payslips, setPayslips] = useState<PayslipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipItem | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();

  const formatCurrency = (val: string) => {
    if (!val) return '—';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
  };

  const fetchPayslips = async () => {
    setLoading(true);
    try {
      if (filterMonth && filterYear) {
        try {
          const payslip = await payrollService.getMyPayslip(filterMonth, filterYear);
          setPayslips([payslip]);
          return;
        } catch {
          setPayslips([]);
          return;
        }
      }
      const result = await payrollService.listMyPayslips();
      setPayslips(result.payslips);
    } catch {
      toast.error('Failed to load payslips.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayslips();
  }, []);

  const handleFilter = () => {
    if (!filterMonth || !filterYear) {
      toast.error('Please select both month and year.');
      return;
    }
    fetchPayslips();
  };

  const clearFilter = () => {
    setFilterMonth('');
    setFilterYear('');
    fetchPayslips();
  };

  const downloadPayslip = async (payslip: PayslipItem) => {
    if (downloadingId) return;
    setDownloadingId(payslip.id);
    try {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const employeeId = payslip.payroll?.employeeId || payslip.id.slice(0, 8);
      const filename = `Payslip-${employeeId}-${monthNames[(payslip.month ?? 1) - 1]}-${payslip.year}.pdf`;
      await payrollService.downloadPayslipPDF(payslip.id, filename);
      toast.success('Payslip downloaded successfully.');
    } catch {
      // error toast shown in service
    } finally {
      setDownloadingId(null);
    }
  };

  const renderPayrollDetails = (payroll: PayrollRecordItem) => (
    <div>
      <h4 className="text-sm font-medium text-slate-700 mb-2">Salary Components</h4>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {payroll.components.map((comp) => (
              <tr key={comp.id}>
                <td className="px-4 py-3 text-sm text-slate-900">{comp.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    comp.type === 'EARNING' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {comp.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-900 text-right">{formatCurrency(comp.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-50 rounded-lg p-4 mt-4">
        <div className="flex justify-between mb-1">
          <span className="text-sm text-slate-600">Gross Earnings</span>
          <span className="text-sm font-medium text-slate-900">{formatCurrency(payroll.grossEarnings)}</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-sm text-slate-600">Total Deductions</span>
          <span className="text-sm font-medium text-slate-900">{formatCurrency(payroll.totalDeductions)}</span>
        </div>
        <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between">
          <span className="text-sm font-semibold text-slate-900">Net Pay</span>
          <span className="text-sm font-bold text-slate-900">{formatCurrency(payroll.netPay)}</span>
        </div>
      </div>
    </div>
  );

  const DownloadButton = ({ payslip }: { payslip: PayslipItem }) => {
    const isApproved = payslip.payroll?.status === 'APPROVED';
    const isDownloading = downloadingId === payslip.id;

    if (!isApproved) {
      return (
        <button
          disabled
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-slate-100 text-slate-400 cursor-not-allowed"
          title="Payslip not yet approved"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          PDF Unavailable
        </button>
      );
    }

    return (
      <button
        onClick={() => downloadPayslip(payslip)}
        disabled={isDownloading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isDownloading ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Downloading...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF
          </>
        )}
      </button>
    );
  };

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={(user?.profile?.firstName && user?.profile?.lastName)
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : user?.email || 'Employee'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="My Payslips" subtitle="View and download your approved payslips" />
      <div className="p-8 max-w-5xl">
        {/* Filter */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
              <select
                value={filterMonth || ''}
                onChange={(e) => setFilterMonth(e.target.value ? parseInt(e.target.value) : '')}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
              <select
                value={filterYear || ''}
                onChange={(e) => setFilterYear(e.target.value ? parseInt(e.target.value) : '')}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All</option>
                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 pt-4">
              <button
                onClick={handleFilter}
                className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
              >
                Filter
              </button>
              <button
                onClick={clearFilter}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Payslips */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Approved Payslips</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : payslips.length === 0 ? (
            <div className="p-8">
              <div className="text-center">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-sm font-medium text-slate-700">No payslips available</p>
                <p className="text-xs text-slate-500 mt-1">
                  Approved payslips will appear here once payroll is processed.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Period</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Gross</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Deductions</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Net Pay</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Generated</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {payslips.map((payslip) => {
                    const payroll = payslip.payroll;
                    if (!payroll) return null;
                    return (
                      <tr key={payslip.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-sm text-slate-900 font-medium">
                          {MONTH_NAMES[payslip.month - 1]} {payslip.year}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatCurrency(payroll.grossEarnings)}</td>
                        <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatCurrency(payroll.totalDeductions)}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-900 text-right">{formatCurrency(payroll.netPay)}</td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {new Date(payslip.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedPayslip(payslip)}
                              className="text-xs text-primary-600 hover:text-primary-700"
                            >
                              View
                            </button>
                            <DownloadButton payslip={payslip} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Payslip Detail Modal */}
      {selectedPayslip && selectedPayslip.payroll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Payslip — {MONTH_NAMES[selectedPayslip.month - 1]} {selectedPayslip.year}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generated: {new Date(selectedPayslip.generatedAt).toLocaleDateString('en-IN')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <DownloadButton payslip={selectedPayslip} />
                <button onClick={() => setSelectedPayslip(null)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              {renderPayrollDetails(selectedPayslip.payroll)}
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
