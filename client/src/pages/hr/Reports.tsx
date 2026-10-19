import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { compoffService } from '../../services/compoff.service';
import { leaveService } from '../../services/leave.service';
import { payrollService, type PayrollDashboardStats } from '../../services/payroll.service';
import { wfhService } from '../../services/wfh.service';
import {
  Panel,
  StatGrid,
} from '../../components/dashboard/widgets';

export default function HrReportsPage() {
  const { user, logout } = useAuth();
  const [pendingLeaves, setPendingLeaves] = useState<number | null>(null);
  const [pendingWfhs, setPendingWfhs] = useState<number | null>(null);
  const [pendingCredits, setPendingCredits] = useState<number | null>(null);
  const [payrollStats, setPayrollStats] = useState<PayrollDashboardStats | null>(null);
  const [approvedPayroll, setApprovedPayroll] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      leaveService.getPendingRequests().then((requests) => requests.length).catch(() => null),
      wfhService.listPending().then((requests) => requests.length).catch(() => null),
      compoffService.listPendingCredits().then((credits) => credits.length).catch(() => null),
      payrollService.getDashboardStats().then((stats) => {
        setApprovedPayroll(stats.approvedThisMonth);
        return stats;
      }),
    ])
      .then(([leaves, wfhs, credits, stats]) => {
        if (!mounted) return;
        setPendingLeaves(leaves);
        setPendingWfhs(wfhs);
        setPendingCredits(credits);
        setPayrollStats(stats);
      })
      .catch(() => {
        if (mounted) setError('Could not load the reports.');
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'HR_ADMIN';

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Reports" subtitle="Reporting for HR operations" />
      <div className="p-8 max-w-7xl">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-6">
          <StatGrid
            stats={[
              {
                key: 'pendingLeaves',
                label: 'Pending Leave Requests',
                value: pendingLeaves ?? 0,
                available: pendingLeaves !== null,
                href: '/hr/leaves',
                tone: 'yellow',
              },
              {
                key: 'pendingWfhs',
                label: 'Pending WFH Requests',
                value: pendingWfhs ?? 0,
                available: pendingWfhs !== null,
                href: '/hr/wfh',
                tone: 'purple',
              },
              {
                key: 'pendingCredits',
                label: 'Pending Comp-Off Reviews',
                value: pendingCredits ?? 0,
                available: pendingCredits !== null,
                href: '/hr/comp-offs',
                tone: 'green',
              },
              {
                key: 'approvedPayroll',
                label: 'Approved This Month',
                value: approvedPayroll ?? 0,
                available: payrollStats !== null,
                href: '/hr/payroll',
                tone: 'blue',
              },
            ]}
            loading={false}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Payroll runs">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Salary structures in use</dt>
                  <dd className="font-medium text-slate-800">{payrollStats?.totalSalaryStructures ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Payroll runs awaiting approval</dt>
                  <dd className="font-medium text-slate-800">{payrollStats?.pendingApproval ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Payroll runs approved this month</dt>
                  <dd className="font-medium text-slate-800">{payrollStats?.approvedThisMonth ?? 0}</dd>
                </div>
              </dl>
            </Panel>
            <Panel title="Approvals awaiting action">
              <p className="text-sm text-slate-500">
                The counts above come from the live queues. Open the Approvals pages for the
                pending leave requests, WFH requests and comp-off reviews.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
