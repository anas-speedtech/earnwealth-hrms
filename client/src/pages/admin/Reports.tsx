import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import type { Department } from '../../services/organization.service';
import { organizationService } from '../../services/organization.service';
import { leaveService, LeaveRequestItem } from '../../services/leave.service';
import { payrollService } from '../../services/payroll.service';
import type { PayrollDashboardStats } from '../../services/payroll.service';
import {
  Panel,
  StatGrid,
  DonutPanel,
  type DonutSlice,
} from '../../components/dashboard/widgets';

export default function AdminReportsPage() {
  const { user, logout } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<number | null>(null);
  const [payrollStats, setPayrollStats] = useState<PayrollDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      organizationService.getDepartments().catch(() => [] as Department[]),
      leaveService.getPendingRequests().catch(() => [] as LeaveRequestItem[]),
      Promise.resolve(payrollStatsSafe()).catch(() => null),
    ])
      .then(([departmentRows, pendingRequests, payroll]) => {
        if (!mounted) return;
        setDepartments(departmentRows);
        setPendingLeaves(pendingRequests.length);
        setPayrollStats(payroll);
      })
      .catch(() => {
        if (mounted) setError('Could not load the reports.');
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : user?.email || 'Admin';

  const totalEmployees = departments.reduce((sum, department) => sum + department.employeeCount, 0);

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Reports" subtitle="Reporting for administration" />
      <div className="p-8 max-w-7xl">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-6">
          <StatGrid
            stats={[
              {
                key: 'employees',
                label: 'Total Employees',
                value: totalEmployees,
                available: true,
                href: '/admin/employees',
                tone: 'blue',
              },
              {
                key: 'pendingLeaves',
                label: 'Pending Leave Requests',
                value: pendingLeaves ?? 0,
                available: pendingLeaves !== null,
                href: '/hr/leaves',
                tone: 'yellow',
              },
              {
                key: 'pendingPayroll',
                label: 'Pending Payroll Runs',
                value: payrollStats?.pendingApproval ?? 0,
                available: payrollStats !== null,
                href: '/super-admin/payroll-approval',
                tone: 'purple',
              },
              {
                key: 'approvedPayroll',
                label: 'Approved This Month',
                value: payrollStats?.approvedThisMonth ?? 0,
                available: payrollStats !== null,
                href: '/super-admin/payroll-approval',
                tone: 'green',
              },
            ]}
            loading={false}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Employees by Department">
              <DonutPanel
                data={donut(
                  departments.map((department) => ({
                    label: department.name,
                    value: department.employeeCount,
                    color: '#3b82f6',
                  })),
                )}
                centerValue={String(totalEmployees)}
                centerLabel="Total"
              />
            </Panel>
            <Panel title="Notes">
              <p className="text-sm text-slate-500">
                Attendance review is available on the Attendance page. Detailed per-module
                reports are produced by the Super Admin and HR roles.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function payrollStatsSafe(): Promise<PayrollDashboardStats | null> {
  return payrollService.getDashboardStats().catch(() => null);
}

function donut(data: { label: string; value: number; color: string }[]): DonutSlice[] {
  return data;
}
