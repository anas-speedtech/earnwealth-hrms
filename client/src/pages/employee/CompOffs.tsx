import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import {
  compoffService,
  CompOffBalance,
  CompOffCreditsPage,
  CompOffLedgerPage,
  CompOffLeaveRequest,
  EligibleDate,
} from '../../services/compoff.service';
import toast from 'react-hot-toast';

export default function EmployeeCompOffPage() {
  const { user, logout } = useAuth();
  const [balance, setBalance] = useState<CompOffBalance | null>(null);
  const [eligibleDates, setEligibleDates] = useState<EligibleDate[]>([]);
  const [creditsPage, setCreditsPage] = useState<CompOffCreditsPage | null>(null);
  const [ledgerPage, setLedgerPage] = useState<CompOffLedgerPage | null>(null);
  const [myLeaveRequests, setMyLeaveRequests] = useState<CompOffLeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Apply comp-off form (redeem a credit for a day of leave).
  const [applyForm, setApplyForm] = useState({ startDate: '', endDate: '', isHalfDay: false, reason: '' });
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setIsLoading(true);
    try {
      const [balanceResult, eligible, credits, ledger, myLeaves] = await Promise.all([
        compoffService.getMyBalance().catch(() => null),
        compoffService.getEligibleDates().catch(() => []),
        compoffService.getMyCredits(1).catch(() => null),
        compoffService.getMyLedger(1).catch(() => null),
        compoffService.listMyLeaveRequests().catch(() => null),
      ]);

      if (balanceResult) setBalance(balanceResult);
      setEligibleDates(eligible);
      if (credits) setCreditsPage(credits);
      if (ledger) setLedgerPage(ledger);
      if (myLeaves) setMyLeaveRequests(myLeaves.requests);
    } finally {
      setIsLoading(false);
    }
  };

  const displayName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : user?.email || 'Employee';

  const firstEligibleDay = eligibleDates.find((day) => day.eligible)?.date;

  const handleRequestCredit = async () => {
    if (!firstEligibleDay) return;
    try {
      await compoffService.requestCredit(firstEligibleDay);
      toast.success(`Comp-off credit requested for ${firstEligibleDay}.`);
      await load();
    } catch {
      toast.error('Could not request the credit.');
    }
  };

  const handleApplyCompOff = async () => {
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

  const todayKey = new Date().toISOString().slice(0, 10);
  const availableDays = balance?.available ?? 0;

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={displayName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Comp-Off" subtitle="Your comp-off balance and requests" />
      <div className="p-6 max-w-6xl">
        {isLoading && <p className="text-slate-500">Loading comp-off information…</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-[15px] font-semibold text-slate-900">Available balance</h3>
            {balance ? (
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Earned</dt>
                  <dd className="font-medium text-slate-800">{balance.totalEarned} days</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Used</dt>
                  <dd className="font-medium text-slate-800">{balance.totalUsed} days</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Adjusted</dt>
                  <dd className="font-medium text-slate-800">{balance.totalAdjusted} days</dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <dt className="font-medium text-slate-700">Available</dt>
                  <dd className="text-base font-bold text-cyan-700">{balance.available} days</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-[13px] text-slate-500">Balance unavailable.</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-[15px] font-semibold text-slate-900">Eligibility for this month</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Days worked on weekends or holidays may earn comp-off credits.
            </p>
            {eligibleDates.length === 0 ? (
              <p className="mt-3 text-[13px] text-slate-500">No eligible days this month.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {eligibleDates.slice(0, 10).map((day) => (
                  <li key={day.date} className="flex justify-between py-1.5">
                    <span className="text-slate-700">{day.date}</span>
                    <span className="text-slate-500">{day.eligible ? 'Earns credit' : 'Does not earn'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-[15px] font-semibold text-slate-900">My comp-off credits</h3>
          {!creditsPage || (creditsPage.credits?.length ?? 0) === 0 ? (
            <p className="mt-2 text-[13px] text-slate-500">No comp-off credits yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {creditsPage.credits.map((credit) => (
                <li key={credit.id} className="flex justify-between py-1.5">
                  <span className="text-slate-700">{credit.sourceDate}</span>
                  <span className="text-slate-500">
                    {credit.earnedDays} day{credit.earnedDays === 1 ? '' : 's'} earned
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-[15px] font-semibold text-slate-900">Ledger</h3>
            {!ledgerPage || (ledgerPage.ledger?.length ?? 0) === 0 ? (
              <p className="mt-2 text-[13px] text-slate-500">No ledger entries yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {ledgerPage.ledger.map((entry) => (
                  <li key={entry.id} className="flex justify-between py-1.5">
                    <span className="text-slate-700">{entry.type}</span>
                    <span className="text-slate-500">{entry.note || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-[15px] font-semibold text-slate-900">Redeemed leave requests</h3>
            {!myLeaveRequests.length ? (
              <p className="mt-2 text-[13px] text-slate-500">No redeemed-days leave requests yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {myLeaveRequests.map((request) => (
                  <li key={request.id} className="flex justify-between py-1.5">
                    <span className="text-slate-700">
                      {request.startDate} → {request.endDate}
                    </span>
                    <span className="text-slate-500">{request.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Apply comp-off leave — redeem a credit for a day of leave */}
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Apply Comp-Off Leave</h3>
              <p className="mt-1 text-[13px] text-slate-500">
                Redeems a credit for a day of leave. Your oldest credit is used first
                (FIFO) and credits expire 3 months after they are earned.
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-semibold text-cyan-700">
              {availableDays} day(s) available
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input
                type="checkbox"
                checked={applyForm.isHalfDay}
                onChange={(e) => setApplyForm({ ...applyForm, isHalfDay: e.target.checked })}
                className="h-4 w-4 rounded accent-cyan-600"
              />
              Half day
            </label>
            <div className="sm:col-span-2">
              <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Reason (optional)</label>
              <input
                type="text"
                value={applyForm.reason}
                onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                placeholder="e.g. family function"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          <button
            onClick={handleApplyCompOff}
            disabled={applying || availableDays < 1}
            className="mt-4 rounded-xl bg-cyan-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-cyan-700 disabled:opacity-50"
          >
            {applying ? 'Applying…' : 'Apply Comp-Off'}
          </button>
        </section>

        <button
          onClick={handleRequestCredit}
          disabled={!firstEligibleDay}
          className="mt-6 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {firstEligibleDay
            ? `Request credit for ${firstEligibleDay}`
            : 'No eligible day available'}
        </button>
      </div>
    </DashboardShell>
  );
}
