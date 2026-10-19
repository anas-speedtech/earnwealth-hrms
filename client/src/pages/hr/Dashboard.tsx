import { useEffect, useMemo, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardService, DashSummary } from '../../services/dashboard.service';
import { leaveService } from '../../services/leave.service';
import { wfhService } from '../../services/wfh.service';
import { Panel, StatGrid, TitledStat, StatusChip, QuickActions, ViewAll } from '../../components/dashboard/widgets';

interface PendingLeave {
  id: string;
  employeeName?: string;
  leaveTypeName?: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface PendingWFH {
  id: string;
  employeeName: string;
  requestDate: string;
  reason: string;
  status: string;
}

export default function HrDashboardPage() {
  const { user, logout } = useAuth();
  const { pendingWfhs, pendingLeaveRows } = usePendingQueues();
  const { data, loading, error } = useDashboard();

  const stats = useMemo(() => toTitledStats(data), [data]);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'HR_ADMIN';

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="HR Dashboard" />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="mb-6 text-sm text-slate-500">Take care of people, build a better workplace.</p>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-6">
          <StatGrid stats={stats} loading={loading} />

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Pending Leave Requests" action={<ViewAll to="/hr/leaves" />} className="lg:col-span-2">
              {pendingLeaveRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No leave requests waiting for review.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pendingLeaveRows.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span className="font-medium text-slate-700">
                        {request.employeeName || 'Unknown'}
                      </span>
                      <span className="text-slate-600">{request.leaveTypeName || 'Leave'}</span>
                      <span className="text-slate-400">{request.startDate} → {request.endDate}</span>
                      <StatusChip status={request.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Quick Actions">
              <QuickActions
                actions={[
                  { label: 'Approve Leaves', to: '/hr/leaves', tone: 'purple' },
                  { label: 'Review WFH', to: '/hr/wfh', tone: 'blue' },
                  { label: 'Manage Payroll', to: '/hr/payroll', tone: 'green' },
                  { label: 'View Reports', to: '/hr/reports', tone: 'yellow' },
                ]}
              />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Pending WFH Requests" className="lg:col-span-2">
              {pendingWfhs.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No WFH requests waiting for review.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {pendingWfhs.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <span className="font-medium text-slate-700">{request.employeeName}</span>
                      <span className="text-slate-400">{request.requestDate}</span>
                      <span className="max-w-md truncate text-slate-600">{request.reason}</span>
                      <StatusChip status={request.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Comp-Off Queue">
              <p className="text-sm text-slate-500">
                Pending comp-off credits and redeemed days are reviewed inside Comp-Off.
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
      .getHrSummary()
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

function usePendingQueues(): {
  pendingWfhs: PendingWFH[];
  pendingLeaveRows: PendingLeave[];
} {
  const [pendingWfhs, setPendingWfhs] = useState<PendingWFH[]>([]);
  const [pendingLeaveRows, setPendingLeaveRows] = useState<PendingLeave[]>([]);

  useEffect(() => {
    let mounted = true;

    leaveService
      .getPendingRequests()
      .then((requests) => {
        if (!mounted) return;
        setPendingLeaveRows(
          requests.map((request) => ({
            id: request.id,
            employeeName: request.employeeName,
            leaveTypeName: request.leaveTypeName,
            startDate: request.startDate,
            endDate: request.endDate,
            status: request.status,
          })),
        );
      })
      .catch(() => {
        // leave the panel empty
      });

    wfhService
      .listPending()
      .then((requests) => {
        if (!mounted) return;
        setPendingWfhs(
          requests.map((request) => ({
            id: request.id,
            employeeName: request.employeeName,
            requestDate: request.requestDate,
            reason: request.reason,
            status: request.status,
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

  return { pendingWfhs, pendingLeaveRows };
}
