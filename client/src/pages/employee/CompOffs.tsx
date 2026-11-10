import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import {
  compoffService,
  CompOffBalance,
  CompOffLeaveRequest,
} from '../../services/compoff.service';
import { formatISTDay } from '../../utils/dates';
import toast from 'react-hot-toast';

// The employee-facing comp-off screen is intentionally short: the balance
// numbers and the Apply action. Credit earning happens automatically (the
// attendance sweep), so the ledger / eligible-day / credit details that used
// to live here were removed — HR keeps those views on their own screens.
export default function EmployeeCompOffPage() {
  const { user, logout } = useAuth();
  const [balance, setBalance] = useState<CompOffBalance | null>(null);
  const [myLeaveRequests, setMyLeaveRequests] = useState<CompOffLeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [applyForm, setApplyForm] = useState({ startDate: '', endDate: '', isHalfDay: false, reason: '' });
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setIsLoading(true);
    try {
      const [balanceResult, myLeaves] = await Promise.all([
        compoffService.getMyBalance().catch(() => null),
        compoffService.listMyLeaveRequests().catch(() => null),
      ]);
      if (balanceResult) setBalance(balanceResult);
      if (myLeaves) setMyLeaveRequests(myLeaves.requests);
    } finally {
      setIsLoading(false);
    }
  };

  const displayName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : user?.email || 'Employee';

  const todayKey = new Date().toISOString().slice(0, 10);
  const availableDays = balance?.available ?? 0;

  const handleApply = async () => {
    if (!applyForm.startDate || !applyForm.endDate) {
      toast.error('Select both a start and an end date.');
      return;
    }
    if (applyForm.startDate > applyForm.endDate) {
      toast.error('End date cannot be before the start date.');
      return;
    }
    setApplying(true);
    try {
      // The backend consumes the oldest un-expired credit first (FIFO) and
      // enforces the 3-month credit validity, so the form just states the
      // leave window.
      await compoffService.applyLeave({
        startDate: applyForm.startDate,
        endDate: applyForm.endDate,
        isHalfDay: applyForm.isHalfDay,
        reason: applyForm.reason || undefined,
      });
      toast.success('Comp-off leave applied.');
      setApplyForm({ startDate: '', endDate: '', isHalfDay: false, reason: '' });
      await load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not apply the comp-off leave.';
      toast.error(message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={displayName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Comp-Off" subtitle="Your balance and applying comp-off leave" />
      <div className="p-6 max-w-4xl">
        {isLoading ? (
          <p className="text-slate-500">Loading comp-off information…</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {/* The numbers */}
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-[15px] font-semibold text-slate-900">Available balance</h3>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Earned</dt>
                  <dd className="font-medium text-slate-800">{balance?.totalEarned ?? 0} days</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Used</dt>
                  <dd className="font-medium text-slate-800">{balance?.totalUsed ?? 0} days</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Adjusted</dt>
                  <dd className="font-medium text-slate-800">{balance?.totalAdjusted ?? 0} days</dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <dt className="font-medium text-slate-700">Available</dt>
                  <dd className="text-base font-bold text-cyan-700">{availableDays} days</dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] text-slate-400">
                Credits are earned automatically on weekend / holiday work and expire 3 months after
                they are earned (FIFO).
              </p>
            </section>

            {/* The Apply option */}
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-slate-900">Apply Comp-Off</h3>
                <span className="text-[13px] font-semibold text-cyan-700">
                  {availableDays} day(s) available
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={applyForm.startDate}
                      min={todayKey}
                      onChange={(e) => setApplyForm({ ...applyForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-slate-600 mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={applyForm.endDate}
                      min={applyForm.startDate || todayKey}
                      onChange={(e) => setApplyForm({ ...applyForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[13px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={applyForm.isHalfDay}
                    onChange={(e) => setApplyForm({ ...applyForm, isHalfDay: e.target.checked })}
                    className="h-4 w-4 rounded accent-cyan-600"
                  />
                  Half day
                </label>

                <div>
                  <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Reason (optional)</label>
                  <input
                    type="text"
                    value={applyForm.reason}
                    onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                    placeholder="e.g. family function"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <button
                  onClick={handleApply}
                  disabled={applying || availableDays < 1}
                  className="rounded-xl bg-cyan-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-cyan-700 disabled:opacity-50"
                >
                  {applying ? 'Applying…' : 'Apply Comp-Off'}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* My applied requests — the one list worth keeping */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-[15px] font-semibold text-slate-900">My Comp-Off Requests</h3>
          {!myLeaveRequests.length ? (
            <p className="mt-2 text-[13px] text-slate-500">No comp-off leave requests yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {myLeaveRequests.map((request) => (
                <li key={request.id} className="flex justify-between py-1.5">
                  <span className="text-slate-700">
                    {formatISTDay(request.startDate)}
                    {request.endDate !== request.startDate ? ` → ${formatISTDay(request.endDate)}` : ''}
                    {request.isHalfDay ? ' (half day)' : ''}
                  </span>
                  <span className="text-slate-500">{request.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
