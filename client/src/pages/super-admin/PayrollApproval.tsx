import { useState, useEffect, useCallback } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { payrollService, PayrollRecordItem, PayrollComponentItem } from '../../services/payroll.service';
import toast from 'react-hot-toast';

type ApprovalTab = 'pending' | 'approved' | 'all';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function SuperAdminPayrollApprovalPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ApprovalTab>('pending');
  const [payrolls, setPayrolls] = useState<PayrollRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollRecordItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveComment, setApproveComment] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvingId2, setApprovingId2] = useState<string | null>(null);

  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();

  const fetchPayrolls = useCallback(async () => {
    setLoading(true);
    try {
      let status: string | undefined;
      if (activeTab === 'pending') status = 'PENDING_APPROVAL';
      else if (activeTab === 'approved') status = 'APPROVED';

      const result = await payrollService.listPayrolls({ page: 1, status, month, year });
      setPayrolls(result.payrolls);
    } catch {
      toast.error('Failed to load payroll records.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, month, year]);

  useEffect(() => {
    fetchPayrolls();
  }, [fetchPayrolls]);

  const handleApprove = async (payrollId: string) => {
    setApprovingId(payrollId);
    try {
      await payrollService.approvePayroll(payrollId, approveComment);
      toast.success('Payroll approved successfully.');
      setShowApproveModal(false);
      setApproveComment('');
      setSelectedPayroll(null);
      fetchPayrolls();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to approve.';
      toast.error(message);
    } finally {
      setApprovingId(null);
      setApprovingId2(null);
    }
  };

  const handleReject = async (payrollId: string) => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason.');
      return;
    }
    setRejectingId(payrollId);
    try {
      await payrollService.rejectPayroll(payrollId, rejectReason.trim());
      toast.success('Payroll rejected.');
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedPayroll(null);
      fetchPayrolls();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to reject.';
      toast.error(message);
    } finally {
      setRejectingId(null);
    }
  };

  const openReject = (payroll: PayrollRecordItem) => {
    setSelectedPayroll(payroll);
    setShowRejectModal(true);
  };

  const openApprove = (payroll: PayrollRecordItem) => {
    setSelectedPayroll(payroll);
    setShowApproveModal(true);
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: 'bg-slate-100 text-slate-700',
      PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
      APPROVED: 'bg-green-100 text-green-700',
      REJECTED: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-slate-100 text-slate-700'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const formatCurrency = (val: string) => {
    if (!val) return '—';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso + 'Z').toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardShell
      role="SUPER_ADMIN"
      userName={(user?.profile?.fullName as string) || user?.email || 'Super Admin'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header
        title="Payroll Approval"
        subtitle="Review submitted payroll for approval"
      />
      <div className="p-8 max-w-6xl">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6">
          {[
            { key: 'pending', label: 'Pending Approval', count: payrolls.filter((p) => p.status === 'PENDING_APPROVAL').length },
            { key: 'approved', label: 'Approved' },
            { key: 'all', label: 'All Records' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as ApprovalTab)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label} {tab.count !== undefined && `(${tab.count})`}
            </button>
          ))}
          <div className="ml-auto text-xs text-slate-500">
            Showing: {MONTH_NAMES[month - 1]} {year}
          </div>
        </div>

        {/* Payroll List */}
        <div className="bg-white rounded-xl border border-slate-200">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : payrolls.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {activeTab === 'pending' ? 'No payroll records pending approval.' : 'No payroll records found.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Gross</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Deductions</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Net Pay</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Submitted</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {payrolls.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm text-slate-900 font-mono">{record.employeeId}</td>
                      <td className="px-6 py-4">
                        {statusBadge(record.status)}
                        {record.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1" title={record.rejectionReason}>
                            {record.rejectionReason.substring(0, 50)}...
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatCurrency(record.grossEarnings)}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatCurrency(record.totalDeductions)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900 text-right">{formatCurrency(record.netPay)}</td>
                      <td className="px-6 py-4 text-xs text-slate-500">{record.submittedAt ? formatDate(record.submittedAt) : '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedPayroll(record)}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            Review
                          </button>
                          {record.status === 'PENDING_APPROVAL' && (
                            <>
                              <button
                                onClick={() => openApprove(record)}
                                disabled={approvingId === record.id}
                                className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                {approvingId === record.id ? '...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => openReject(record)}
                                disabled={rejectingId === record.id}
                                className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedPayroll && !showRejectModal && !showApproveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Payroll Detail</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Employee: {selectedPayroll.employeeId} | {MONTH_NAMES[selectedPayroll.month - 1]} {selectedPayroll.year}
                </p>
              </div>
              <button onClick={() => setSelectedPayroll(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                {statusBadge(selectedPayroll.status)}
                <span className="text-sm text-slate-500">
                  Submitted: {selectedPayroll.submittedAt ? formatDate(selectedPayroll.submittedAt) : '—'}
                </span>
              </div>
              {selectedPayroll.rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700">Rejection Reason:</p>
                  <p className="text-sm text-red-600">{selectedPayroll.rejectionReason}</p>
                </div>
              )}
              {/* Component Breakdown */}
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
                      {selectedPayroll.components.map((comp: PayrollComponentItem) => (
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
              </div>
              {/* Summary */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-slate-600">Gross Earnings</span>
                  <span className="text-sm font-medium text-slate-900">{formatCurrency(selectedPayroll.grossEarnings)}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-slate-600">Total Deductions</span>
                  <span className="text-sm font-medium text-slate-900">{formatCurrency(selectedPayroll.totalDeductions)}</span>
                </div>
                <div className="border-t border-slate-200 pt-1 mt-1 flex justify-between">
                  <span className="text-sm font-semibold text-slate-900">Net Pay</span>
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(selectedPayroll.netPay)}</span>
                </div>
              </div>
              {selectedPayroll.status === 'PENDING_APPROVAL' && (
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setSelectedPayroll(null);
                      openReject(selectedPayroll);
                    }}
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPayroll(null);
                      openApprove(selectedPayroll);
                    }}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {showApproveModal && selectedPayroll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Confirm Approval</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  Employee: <span className="font-mono font-medium">{selectedPayroll.employeeId}</span>
                </p>
                <p className="text-sm text-green-800">
                  Period: {MONTH_NAMES[selectedPayroll.month - 1]} {selectedPayroll.year}
                </p>
                <p className="text-sm text-green-800 font-medium mt-1">
                  Net Pay: {formatCurrency(selectedPayroll.netPay)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Comment (optional)</label>
                <textarea
                  value={approveComment}
                  onChange={(e) => setApproveComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={2}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => { setShowApproveModal(false); setSelectedPayroll(null); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApprove(selectedPayroll.id)}
                disabled={approvingId2 === selectedPayroll.id}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {approvingId2 === selectedPayroll.id ? 'Approving...' : 'Approve Payroll'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedPayroll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Reject Payroll</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Rejecting payroll for employee <span className="font-mono font-medium">{selectedPayroll.employeeId}</span> for{' '}
                {MONTH_NAMES[selectedPayroll.month - 1]} {selectedPayroll.year}.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this payroll is being rejected..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => { setShowRejectModal(false); setSelectedPayroll(null); setRejectReason(''); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(selectedPayroll.id)}
                disabled={rejectingId === selectedPayroll.id}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {rejectingId === selectedPayroll.id ? 'Rejecting...' : 'Reject Payroll'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
