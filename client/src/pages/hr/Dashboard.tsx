import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';

export default function HrDashboard() {
  const { user, logout } = useAuth();

  return (
    <DashboardShell
      role="HR"
      userName={(user?.profile?.fullName as string) || user?.email || 'HR Manager'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="HR Dashboard" subtitle="Human resources operations" />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Pending Leaves" value="—" color="yellow" />
          <StatCard title="Pending WFH" value="—" color="blue" />
          <StatCard title="Pending Corrections" value="—" color="green" />
          <StatCard title="Pending Payroll" value="—" color="purple" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Welcome</h3>
          <p className="text-slate-500 text-sm">
            Use the navigation to review attendance, manage leaves, process payroll, and generate payslips.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
    yellow: 'text-yellow-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className={`text-3xl font-bold mt-2 ${colorClasses[color] || 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
