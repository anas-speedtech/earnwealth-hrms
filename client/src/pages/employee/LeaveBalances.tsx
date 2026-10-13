import { useState, useEffect } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveBalanceItem } from '../../services/leave.service';

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

  const classificationColors: Record<string, string> = {
    PAID: 'bg-blue-100 text-blue-700',
    UNPAID: 'bg-orange-100 text-orange-700',
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
      <Header title="Leave Balances" subtitle="Your current leave balances" />
      <div className="p-8 max-w-4xl">
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Current Balances</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : balances.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No leave balances available. Contact HR to initialize your balances.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {balances.map((b) => (
                <div key={b.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{b.leaveTypeName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{b.leaveTypeCode}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium mb-1 ${classificationColors[b.classification] || 'bg-slate-100 text-slate-700'}`}>
                      {b.classification}
                    </span>
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Available:</span>
                        <span className={`ml-1 font-semibold ${b.availableBalance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {b.availableBalance.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        <span className="text-slate-500">Used:</span>
                        <span className="ml-1">{b.usedBalance.toFixed(2)}</span>
                      </div>
                      <div className="text-slate-400">
                        <span className="text-slate-500">Reserved:</span>
                        <span className="ml-1">{b.reservedBalance.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
