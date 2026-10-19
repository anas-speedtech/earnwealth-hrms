import { useEffect, useMemo, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardService, DashSummary } from '../../services/dashboard.service';
import type { Department } from '../../services/organization.service';
import { organizationService } from '../../services/organization.service';
import api from '../../services/api';
import { Panel, StatGrid, TitledStat, DonutPanel, ActivityTable, QuickActions, ViewAll } from '../../components/dashboard/widgets';

export default function SuperAdminDashboardPage() {
  const { user, logout } = useAuth();
  const departments = useDepartments();
  const activities = useRecentActivities();
  const { data, loading, error } = useDashboard();

  const stats = useMemo(() => toTitledStats(data), [data]);

  const totalEmployees = Number(stats.find((s) => s.key === 'employees')?.value ?? 0);
  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  return (
    <DashboardShell role="SUPER_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Super Admin Dashboard" />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="mb-6 text-sm text-slate-500">
          Oversight of every module: employees, approvals, payroll and the audit trail.
        </p>
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
                  { label: 'Review Payroll', to: '/super-admin/payroll-approval', tone: 'purple' },
                  { label: 'Holiday Calendar', to: '/super-admin/holidays', tone: 'yellow' },
                ]}
              />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel
              title="Recent Activities"
              action={<ViewAll to="/super-admin/audit-logs" />}
              className="lg:col-span-2"
            >
              <ActivityTable rows={activities} columns={[['Activity', 'activity'], ['User', 'user']]} />
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
      .getSuperAdminSummary()
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

function useRecentActivities() {
  const [rows, setRows] = useState<{ date: string; activity: string; user: string }[]>([]);
  useEffect(() => {
    let mounted = true;
    api
      .get<{ data: { logs: unknown[] } }>('/audit-logs', { params: { limit: 10 } })
      .then((response) => {
        if (!mounted) return;
        const logs = response.data.data.logs as Array<{
          createdAt: string;
          action: string;
          actorName: string | null;
        }>;
        setRows(
          logs.map((log) => ({
            date: log.createdAt.slice(0, 10),
            activity: describeAction(log.action),
            user: log.actorName || 'System',
          })),
        );
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

function describeAction(action: string): string {
  const labels: Record<string, string> = {
    LOGIN: 'Signed in',
    LOGOUT: 'Signed out',
    PASSWORD_RESET: 'Password reset',
    CREATE_USER: 'Account created',
    UPDATE_USER: 'Account updated',
    CREATE_DESIGNATION: 'Designation created',
    UPDATE_DESIGNATION: 'Designation updated',
    CREATE_DEPARTMENT: 'Department created',
    UPDATE_DEPARTMENT: 'Department updated',
    APPROVE_LEAVE: 'Leave approved',
    REJECT_LEAVE: 'Leave rejected',
    APPROVE_WFH: 'WFH approved',
    REJECT_WFH: 'WFH rejected',
    CREATE_HOLIDAY: 'Holiday created',
    UPDATE_HOLIDAY: 'Holiday updated',
    DELETE_HOLIDAY: 'Holiday deleted',
    CREATE_INVITATION: 'Invitation sent',
  };
  if (labels[action]) return labels[action];
  return `${action.replace(/_/g, ' ')} on ${action}`;
}

function donutData(
  departments: Department[],
): { label: string; value: number; color: string }[] {
  const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#ec4899'];
  return departments.map((department, index) => ({
    label: department.name,
    value: department.employeeCount,
    color: palette[index % palette.length],
  }));
}
