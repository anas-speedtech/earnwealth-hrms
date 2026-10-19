import { useState, useEffect, useMemo } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveBalanceItem } from '../../services/leave.service';

// Regular leave types to display: Privilege Leave (PL), Casual Leave (CL), Paid Leave (EL).
// Filter by the `code` field returned by the backend API (not `leaveTypeCode` which doesn't exist).
const REGULAR_LEAVE_CODES = ['PL', 'CL', 'EL'];
const LEAVE_DISPLAY_NAMES: Record<string, string> = {
  PL: 'Privilege Leave',
  CL: 'Casual Leave',
  EL: 'Paid Leave',
};

export default function EmployeeLeaveBalancesPage() {
  const { user, logout } = useAuth();
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBalances = async () => {
    try {
      const data = await leaveService.getMyBalances();
      setBalances(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, []);

  const rows = useMemo(() => balances
    .filter((b) => REGULAR_LEAVE_CODES.includes(b.code))
    .map((b) => ({
      ...b,
      leaveTypeName: LEAVE_DISPLAY_NAMES[b.code] || b.displayName || b.name,
      leaveTypeCode: b.code,
      allocated: Number(b.openingBalance || 0) + Number(b.accruedBalance || 0),
      used: Number(b.usedBalance || 0),
      available: Number(b.availableBalance || 0),
    })), [balances]);

  const totals = useMemo(() => {
    let allocated = 0;
    let used = 0;
    let available = 0;
    for (const row of rows) {
      allocated += row.allocated;
      used += row.used;
      available += row.available;
    }
    return { allocated, used, available };
  }, [rows]);

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={(user?.profile?.firstName && user?.profile?.lastName)
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : user?.email || 'Employee'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Leave Balances" subtitle="Your current leave balances" />
      <div className="p-8 max-w-4xl">
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Current Balances</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No leave balances available. Contact HR to initialize your balances.</div>
          ) : (
            <>
              <div className="divide-y divide-slate-200">
                {rows.map((b) => (
                  <div key={b.id || b.leaveTypeId} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{b.leaveTypeName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{b.leaveTypeCode}</p>
                    </div>
                    <div className="text-right">
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
                  </div>
                ))}
              </div>
              <div className="mt-6 px-6 py-4 border border-slate-200 rounded-xl bg-slate-50">
                <h4 className="mb-3 text-sm font-semibold text-slate-700">Totals</h4>
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
                      <td className="px-4 py-2 text-right">{totals.allocated.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{totals.used.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{totals.available.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-500">
                  Totals cover regular leave types only. Comp-Off credits are tracked separately under Comp-Off and
                  WFH does not affect leave balances.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}