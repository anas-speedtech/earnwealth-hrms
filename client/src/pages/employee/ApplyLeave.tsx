import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveTypeItem, LeaveBalanceItem } from '../../services/leave.service';
import toast from 'react-hot-toast';

const today = new Date().toISOString().split('T')[0];

export default function EmployeeApplyLeavePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeItem[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    isHalfDay: false,
    halfDayPeriod: 'FIRST_HALF' as 'FIRST_HALF' | 'SECOND_HALF',
    reason: '',
  });

  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const [types, bal] = await Promise.all([
        leaveService.getActiveLeaveTypes(),
        leaveService.getMyBalances(),
      ]);
      setLeaveTypes(types);
      setBalances(bal);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.leaveTypeId) newErrors.leaveTypeId = 'Please select a leave type.';
    if (!form.startDate) newErrors.startDate = 'Start date is required.';
    if (!form.endDate) newErrors.endDate = 'End date is required.';
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      newErrors.endDate = 'End date cannot be before start date.';
    }
    if (form.isHalfDay && !form.halfDayPeriod) {
      newErrors.halfDayPeriod = 'Select a half-day period.';
    }
    if (!form.reason.trim()) newErrors.reason = 'Reason is required.';

    // Check balance
    const balance = balances.find((b) => b.leaveTypeId === form.leaveTypeId);
    if (balance && form.startDate && form.endDate) {
      // Rough estimate: 1 day per selected day
      const selectedDays = new Date(form.endDate + 'T00:00:00+05:30').getTime() - new Date(form.startDate + 'T00:00:00+05:30').getTime();
      const days = Math.max(1, Math.round(selectedDays / 86400000) + 1);
      if (balance.availableBalance < days) {
        newErrors.leaveTypeId = `Insufficient balance (${balance.availableBalance.toFixed(2)} days available).`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await leaveService.createRequest(form);
      toast.success('Leave request submitted!');
      navigate('/employee/leaves');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to submit request.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedBalance = balances.find((b) => b.leaveTypeId === form.leaveTypeId);
  const selectedType = leaveTypes.find((lt) => lt.id === form.leaveTypeId);

  const minDate = today;

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={(user?.profile?.firstName && user?.profile?.lastName)
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : user?.email || 'Employee'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Apply for Leave" subtitle="Submit a new leave application" />
      <div className="p-8 max-w-2xl">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading leave types...</div>
          ) : leaveTypes.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No leave types configured. Contact HR.</div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-1">Leave Type</label>
                <select
                  value={form.leaveTypeId}
                  onChange={(e) => {
                    setForm({ ...form, leaveTypeId: e.target.value });
                    if (errors.leaveTypeId) setErrors((prev) => ({ ...prev, leaveTypeId: undefined }));
                  }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.leaveTypeId ? 'border-red-300 bg-red-50' : 'border-slate-300'
                  }`}
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.displayName} ({lt.code}) — {lt.classification}
                    </option>
                  ))}
                </select>
                {errors.leaveTypeId && <p className="mt-1 text-sm text-red-600">{errors.leaveTypeId}</p>}
                {selectedBalance && (
                  <p className="mt-1 text-xs text-slate-500">
                    Available balance: <span className="font-medium">{selectedBalance.availableBalance.toFixed(2)} days</span>
                  </p>
                )}
                {selectedType?.policy && (
                  <p className="mt-1 text-xs text-slate-400">
                    Max consecutive: {selectedType.policy.maxConsecutiveDays || 'None'} |
                    Min notice: {selectedType.policy.minDaysBeforeApply} day(s)
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    min={minDate}
                    onChange={(e) => {
                      setForm({ ...form, startDate: e.target.value });
                      if (errors.startDate) setErrors((prev) => ({ ...prev, startDate: undefined }));
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.startDate ? 'border-red-300 bg-red-50' : 'border-slate-300'
                    }`}
                    required
                  />
                  {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate || minDate}
                    onChange={(e) => {
                      setForm({ ...form, endDate: e.target.value });
                      if (errors.endDate) setErrors((prev) => ({ ...prev, endDate: undefined }));
                    }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.endDate ? 'border-red-300 bg-red-50' : 'border-slate-300'
                    }`}
                    required
                  />
                  {errors.endDate && <p className="mt-1 text-sm text-red-600">{errors.endDate}</p>}
                </div>
              </div>

              {selectedType?.isHalfDayAllowed && (
                <div className="mb-5">
                  <label className="flex items-center gap-2 mb-2">
                    <input
                      type="checkbox"
                      checked={form.isHalfDay}
                      onChange={(e) => setForm({ ...form, isHalfDay: e.target.checked })}
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-slate-700">Half-day leave</span>
                  </label>
                  {form.isHalfDay && (
                    <div className="ml-6">
                      <select
                        value={form.halfDayPeriod}
                        onChange={(e) => setForm({ ...form, halfDayPeriod: e.target.value as 'FIRST_HALF' | 'SECOND_HALF' })}
                        className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          errors.halfDayPeriod ? 'border-red-300 bg-red-50' : 'border-slate-300'
                        }`}
                      >
                        <option value="FIRST_HALF">First Half</option>
                        <option value="SECOND_HALF">Second Half</option>
                      </select>
                      {errors.halfDayPeriod && <p className="mt-1 text-sm text-red-600">{errors.halfDayPeriod}</p>}
                    </div>
                  )}
                </div>
              )}

              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => {
                    setForm({ ...form, reason: e.target.value });
                    if (errors.reason) setErrors((prev) => ({ ...prev, reason: undefined }));
                  }}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.reason ? 'border-red-300 bg-red-50' : 'border-slate-300'
                  }`}
                  placeholder="Briefly explain your reason for leave"
                  required
                />
                {errors.reason && <p className="mt-1 text-sm text-red-600">{errors.reason}</p>}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Submit Leave Request'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/employee/leaves')}
                  className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
