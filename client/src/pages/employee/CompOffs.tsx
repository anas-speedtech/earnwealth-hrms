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

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={displayName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Comp-Off" subtitle="Your comp-off balance and requests" />
      <div className="p-8 max-w-6xl">
        {isLoading && <p className="text-slate-500">Loading comp-off information…</p>}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-900">Available balance</h3>
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
                  <dd className="text-lg font-bold text-primary-700">{balance.available} days</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Balance unavailable.</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-900">Eligibility for this month</h3>
            <p className="mt-1 text-sm text-slate-500">
              Days worked on weekends or holidays may earn comp-off credits.
            </p>
            {eligibleDates.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No eligible days this month.</p>
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
          <h3 className="text-lg font-semibold text-slate-900">My comp-off credits</h3>
          {!creditsPage || (creditsPage.credits?.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No comp-off credits yet.</p>
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
            <h3 className="text-lg font-semibold text-slate-900">Ledger</h3>
            {!ledgerPage || (ledgerPage.ledger?.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No ledger entries yet.</p>
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
            <h3 className="text-lg font-semibold text-slate-900">Redeemed leave requests</h3>
            {!myLeaveRequests.length ? (
              <p className="mt-2 text-sm text-slate-500">No redeemed-days leave requests yet.</p>
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

        <button
          onClick={handleRequestCredit}
          disabled={!firstEligibleDay}
          className="mt-6 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {firstEligibleDay
            ? `Request credit for ${firstEligibleDay}`
            : 'No eligible day available'}
        </button>
      </div>
    </DashboardShell>
  );
}
