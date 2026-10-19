import { useEffect, useMemo, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardService, DashSummary } from '../../services/dashboard.service';
import { leaveService, LeaveRequestItem } from '../../services/leave.service';
import type { Department } from '../../services/organization.service';
import { organizationService } from '../../services/organization.service';
import {
  Panel,
  StatGrid,
  TitledStat,
  DonutPanel,
  LeaveTable,
  QuickActions,
  ViewAll,
} from '../../components/dashboard/widgets';

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const departments = useDepartments();
  const recentLeaves = useRecentLeaves();
  const { data, loading, error } = useDashboard();

  const stats = useMemo(() => toTitledStats(data), [data]);

  const totalEmployees = Number(
    stats.find((s) => s.key === 'employees')?.value ?? 0,
  );
  const displayName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : user?.email || 'Admin';

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Admin Dashboard" />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="mb-6 text-sm text-slate-500">Manage your team and keep things running smoothly.</p>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-6">
          <StatGrid stats={stats} loading={loading} />

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Department-wise Employees" className="lg:col-span-2">
              <DonutPanel
                data={donutData(departments)}
                centerValue={String(totalEmployees)}
                centerLabel="Total"
              />
            </Panel>
            <Panel title="Quick Actions">
              <QuickActions
                actions={[
                  { label: 'Add Employee', to: '/admin/employees/new', tone: 'blue' },
                  { label: 'Manage Departments', to: '/admin/departments', tone: 'green' },
                  { label: 'Review Attendance', to: '/admin/attendance', tone: 'purple' },
                  { label: 'Leave Approvals', to: '/hr/leaves', tone: 'yellow' },
                ]}
              />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel
              title="Recent Leave Requests"
              action={<ViewAll to="/hr/leaves" />}
              className="lg:col-span-2"
            >
              <LeaveTable rows={leaveRows(recentLeaves)} />
            </Panel>
            <Panel title="Reports">
              <p className="text-sm text-slate-500">
                Detailed reports per module are available under Reports.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

// ---- live data ----

function useDepartments() {
  const [rows, setRows] = useState<Department[]>([]);
  useEffect(() => {
    let mounted = true;
    organizationService
      .getDepartments()
      .then((departments) => {
        if (mounted) setRows(departments);
      })
      .catch(() => {
        // leave the panel empty
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return rows;
}

function useRecentLeaves() {
  const [rows, setRows] = useState<LeaveRequestItem[]>([]);
  useEffect(() => {
    let mounted = true;
    leaveService
      .getAllRequests({ page: 1 })
      .then((result) => {
        if (mounted) setRows(result.requests);
      })
      .catch(() => {
        // leave the panel empty
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return rows;
}

function useDashboard(): { data: DashSummary | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: DashSummary | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    setState({ data: null, loading: true, error: null });
    dashboardService
      .getAdminSummary()
      .then((data) => {
        if (mounted) setState({ data, loading: false, error: null });
      })
      .catch(() => {
        if (mounted) setState({ data: null, loading: false, error: 'Could not load the dashboard.' });
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

function toTitledStats(summary: DashSummary | null): TitledStat[] {
  if (!summary) return [];
  return summary.stats.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.value,
    subLabel: s.subLabel,
    href: s.href,
    tone: s.tone,
    available: s.available,
  }));
}

function leaveRows(
  requests: LeaveRequestItem[],
): { employee: string; type: string; dates: string; status: string }[] {
  return requests.map((request) => ({
    employee: request.employeeName || 'Unknown',
    type: request.leaveTypeName || 'Leave',
    dates: `${request.startDate} → ${request.endDate}`,
    status: request.status,
  }));
}

function donutData(departments: Department[]): { label: string; value: number; color: string }[] {
  const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#ec4899'];
  return departments.map((department, index) => ({
    label: department.name,
    value: department.employeeCount,
    color: palette[index % palette.length],
  }));
}
