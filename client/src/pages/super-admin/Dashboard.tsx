import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

interface DashboardStats {
  totalEmployees: number;
  activeAdmins: number;
  hrStaff: number;
  pendingApprovals: number;
}

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<DashboardStats>('/super-admin/stats')
      .then((response) => {
        if (active) setStats(response.data);
      })
      .catch(() => {
        if (active) setStatsError('Unable to load dashboard statistics.');
      });
    return () => {
      active = false;
    };
  }, []);

  const valueFor = (value: number | undefined) => (stats ? String(value ?? 0) : '—');

  return (
    <DashboardShell
      role="SUPER_ADMIN"
      userName={(user?.profile?.fullName as string) || user?.email || 'Super Admin'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Super Admin Dashboard" subtitle="System administration and oversight" />
      <div className="p-8">
        {statsError && <p className="mb-4 text-sm text-red-600">{statsError}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Employees" value={valueFor(stats?.totalEmployees)} color="blue" />
          <StatCard title="Active Admins" value={valueFor(stats?.activeAdmins)} color="green" />
          <StatCard title="HR Staff" value={valueFor(stats?.hrStaff)} color="purple" />
          <StatCard title="Pending Approvals" value={valueFor(stats?.pendingApprovals)} color="yellow" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">System Overview</h3>
          <p className="text-slate-500 text-sm">
            Welcome to the EWS HRMS Super Admin panel. Use the navigation to manage
            admin accounts, HR staff, company settings, policies, holidays, audit logs, and reports.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className={`text-3xl font-bold mt-2 ${colorClasses[color] || 'text-slate-900'}`}>{value}</p>
    </div>
  );
}