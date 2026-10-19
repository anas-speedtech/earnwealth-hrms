import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { compoffService } from '../../services/compoff.service';
import type { Department, Designation } from '../../services/organization.service';
import { organizationService } from '../../services/organization.service';
import { payrollService } from '../../services/payroll.service';
import type { PayrollDashboardStats } from '../../services/payroll.service';
import { Panel, StatGrid, DonutPanel, type DonutSlice } from '../../components/dashboard/widgets';

export default function SuperAdminReportsPage() {
  const { user, logout } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [payrollStats, setPayrollStats] = useState<PayrollDashboardStats | null>(null);
  const [pendingCredits, setPendingCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      organizationService.getDepartments().catch(() => []),
      organizationService.getDesignations().catch(() => []),
      payrollService.getDashboardStats().catch(() => null),
      compoffService
        .listPendingCredits()
        .then((pending) => pending.length)
        .catch(() => null),
    ])
      .then(([departmentRows, designationRows, payroll, pendingCount]) => {
        if (!mounted) return;
        setDepartments(departmentRows);
        setDesignations(designationRows);
        setPayrollStats(payroll);
        setPendingCredits(pendingCount);
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
    : user?.email || 'Super Admin';

  const totalEmployees = departments.reduce((sum, department) => sum + department.employeeCount, 0);

  return (
    <DashboardShell role="SUPER_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Reports" subtitle="Cross-module reporting for oversight" />
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
                key: 'pendingCredits',
                label: 'Pending Comp-Off Reviews',
                value: pendingCredits ?? 0,
                available: pendingCredits !== null,
                href: '/hr/comp-offs',
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
            <Panel title="Employees by Designation">
              {designations.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No designations configured.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {designations.map((designation) => (
                    <li key={designation.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-slate-700">{designation.name}</span>
                      <span className="font-semibold text-slate-800">{designation.employeeCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function donut(data: { label: string; value: number; color: string }[]): DonutSlice[] {
  return data;
}
