import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveBalanceItem } from '../../services/leave.service';
import { wfhService, WFHRequest } from '../../services/wfh.service';
import { compoffService, CompOffBalance } from '../../services/compoff.service';

type LeavesTab = 'leave-requests' | 'balances' | 'wfh' | 'comp-off';

const TABS: { key: LeavesTab; label: string }[] = [
  { key: 'leave-requests', label: 'Leave Requests' },
  { key: 'balances', label: 'Leave Balances' },
  { key: 'wfh', label: 'WFH' },
  { key: 'comp-off', label: 'Comp-Off' },
];

// Regular leave types to display: Privilege Leave (PL), Casual Leave (CL), Paid Leave (EL).
const REGULAR_LEAVE_CODES = ['PL', 'CL', 'EL'];
const LEAVE_DISPLAY_NAMES: Record<string, string> = {
  PL: 'Privilege Leave',
  CL: 'Casual Leave',
  EL: 'Paid Leave',
};

export default function EmployeeLeavesPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<LeavesTab>('leave-requests');
  const [requests, setRequests] = useState<unknown[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [wfhRequests, setWfhRequests] = useState<WFHRequest[]>([]);
  const [wfhLoading, setWfhLoading] = useState(true);
  const [compOffBalance, setCompOffBalance] = useState<CompOffBalance | null>(null);
  const [compOffLoading, setCompOffLoading] = useState(true);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Employee';

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const data = await leaveService.getMyRequests(1);
      setRequests(data.requests);
    } catch {
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadBalances = async () => {
    setBalancesLoading(true);
    try {
      const data = await leaveService.getMyBalances();
      setBalances(data);
    } catch {
      setBalances([]);
    } finally {
      setBalancesLoading(false);
    }
  };

  const loadWfh = async () => {
    setWfhLoading(true);
    try {
      const data = await wfhService.listMy(1);
      setWfhRequests(data.requests);
    } catch {
      setWfhRequests([]);
    } finally {
      setWfhLoading(false);
    }
  };

  const loadCompOff = async () => {
    setCompOffLoading(true);
    try {
      const data = await compoffService.getMyBalance();
      setCompOffBalance(data);
    } catch {
      setCompOffBalance(null);
    } finally {
      setCompOffLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    loadBalances();
    loadWfh();
    loadCompOff();
  }, []);

  // Filter to only the three regular leave types
  const regularRows = balances
    .filter((b) => REGULAR_LEAVE_CODES.includes(b.code))
    .map((b) => ({
      ...b,
      leaveTypeName: LEAVE_DISPLAY_NAMES[b.code] || b.displayName || b.name,
      leaveTypeCode: b.code,
      allocated: Number(b.openingBalance || 0) + Number(b.accruedBalance || 0),
      used: Number(b.usedBalance || 0),
      available: Number(b.availableBalance || 0),
    }));

  const regularTotals = regularRows.reduce(
    (acc, row) => ({
      allocated: acc.allocated + row.allocated,
      used: acc.used + row.used,
      available: acc.available + row.available,
    }),
    { allocated: 0, used: 0, available: 0 },
  );

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={displayName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Leaves" subtitle="Leave requests, balances, WFH and comp-off" />
      <div className="p-8 max-w-6xl">
        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Leave Requests Tab */}
        {activeTab === 'leave-requests' && (
          <section>
            <h3 className="mb-3 text-base font-semibold text-slate-700">My Leave Requests</h3>
            {requestsLoading ? (
              <p className="text-slate-500">Loading leave requests.</p>
            ) : requests.length === 0 ? (
              <p className="text-slate-500">No leave requests found.</p>
            ) : (
              <div className="space-y-3">
                {requests.map((req: any) => (
                  <div key={req.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-medium text-slate-800">
                        {req.leaveTypeName || req.type} - {req.startDate} to {req.endDate}
                      </p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {req.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{req.reason}</p>
                    <p className="mt-1 text-xs text-slate-400">{req.totalDays} day(s)</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Leave Balances Tab */}
        {activeTab === 'balances' && (
          <section>
            <h3 className="mb-3 text-base font-semibold text-slate-700">Leave Balances</h3>
            {balancesLoading ? (
              <p className="text-slate-500">Loading balances.</p>
            ) : regularRows.length === 0 ? (
              <p className="text-slate-500">No leave balances available. Contact HR to initialize your balances.</p>
            ) : (
              <>
                <div className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200">
                  {regularRows.map((b) => (
                    <div key={b.leaveTypeId || b.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{b.leaveTypeName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{b.leaveTypeCode}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="text-slate-500">Allocated:</span>
                          <span className="ml-1 font-semibold text-slate-900">{b.allocated.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Used:</span>
                          <span className="ml-1">{b.used.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Remaining:</span>
                          <span className={`ml-1 font-semibold ${b.available > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {b.available.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 px-6 py-4 border border-slate-200 rounded-xl bg-slate-50">
                  <h4 className="mb-3 text-sm font-semibold text-slate-700">Regular Leave Total</h4>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-left text-slate-500">
                      <tr>
                        <th className="px-4 py-2">Regular leave</th>
                        <th className="px-4 py-2 text-right">Allocated</th>
                        <th className="px-4 py-2 text-right">Used</th>
                        <th className="px-4 py-2 text-right">Remaining</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      <tr className="border-t border-slate-200">
                        <td className="px-4 py-2 font-medium">Privilege / Casual / Paid</td>
                        <td className="px-4 py-2 text-right">{regularTotals.allocated.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">{regularTotals.used.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{regularTotals.available.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-slate-500">
                    Totals cover regular leave types only. Comp-Off credits are tracked separately below and
                    WFH does not affect leave balances.
                  </p>
                </div>
              </>
            )}
          </section>
        )}

        {/* WFH Tab */}
        {activeTab === 'wfh' && (
          <section>
            <h3 className="mb-3 text-base font-semibold text-slate-700">WFH Requests</h3>
            {wfhLoading ? (
              <p className="text-slate-500">Loading WFH requests.</p>
            ) : wfhRequests.length === 0 ? (
              <p className="text-slate-500">No WFH requests found.</p>
            ) : (
              <div className="space-y-3">
                {wfhRequests.map((req: any) => (
                  <div key={req.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-medium text-slate-800">
                        {req.requestDate} - {req.reason}
                      </p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {req.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Comp-Off Tab */}
        {activeTab === 'comp-off' && (
          <section>
            <h3 className="mb-3 text-base font-semibold text-slate-700">Comp-Off</h3>
            {compOffLoading ? (
              <p className="text-slate-500">Loading comp-off balance.</p>
            ) : compOffBalance ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-slate-500">Earned</p>
                    <p className="text-2xl font-bold text-slate-900">{compOffBalance.totalEarned}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Used</p>
                    <p className="text-2xl font-bold text-slate-900">{compOffBalance.totalUsed}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Available</p>
                    <p className="text-2xl font-bold text-green-600">{compOffBalance.available}</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Comp-Off credits are tracked separately and are not included in regular leave totals.
                </p>
              </div>
            ) : (
              <p className="text-slate-500">No comp-off balance available.</p>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}