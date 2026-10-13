import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={(user?.profile?.firstName && user?.profile?.lastName)
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : user?.email || 'Employee'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Employee Dashboard" subtitle="Your self-service portal" />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <QuickAction label="Attendance" href="/employee/attendance" />
          <QuickAction label="Leave Balance" href="/employee/leaves" />
          <QuickAction label="Comp-Off" href="/employee/comp-offs" />
          <QuickAction label="Payslips" href="/employee/payslips" />
          <QuickAction label="Notifications" href="/employee/notifications" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Welcome</h3>
          <p className="text-slate-500 text-sm">
            Use the navigation to manage your attendance, apply for leave, track comp-off, view payslips, and check notifications.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}

function QuickAction({ label, href }: { label: string; href: string }) {
  return (
    <Link
      to={href}
      className="flex flex-col items-center gap-3 p-6 bg-white rounded-xl border border-slate-200 hover:border-primary-300 hover:shadow-md transition-all"
    >
      <div className="p-3 bg-primary-50 text-primary-600 rounded-lg text-sm font-bold">
        {label.charAt(0)}
      </div>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </Link>
  );
}
