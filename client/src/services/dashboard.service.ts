import api from './api';

// Aggregation service for the four role dashboards.
//
// Each method combines several existing backend endpoints so a dashboard
// renders with a single load() call. Endpoints are grouped by the tables they
// read so a caller can see which modules are real:
//
//   leaves (leaves, leave_balances, leave_types, leave_policies)  - populated
//   attendance (attendance_logs)                                   - populated
//   employees / departments / designations                         - populated
//   comp_off_credits                                               - populated
//   salary_slips                                                   - populated
//
//   wfh (wfh_requests)       - populated
//   corrections              - not exposed on any role page
//
// Backend response shapes (verified against actual route handlers):
//   GET /employees              → { data: Employee[], pagination: { page, pageSize, total, pages } }
//   GET /departments            → Department[]
//   GET /designations           → Designation[]
//   GET /leaves/pending         → LeaveRequest[]  (raw array)
//   GET /compoff/pending        → CompOffCredit[] (raw array)
//   GET /compoff/my-credits     → CompOffCredit[] (raw array)
//   GET /compoff/ledger         → { ledger: LedgerEntry[], pagination: ... }
//   GET /compoff/balance        → { available, used, pending }  (single object)
//   GET /payroll/stats          → { data: { totalSalaryStructures, pendingApproval, approvedThisMonth, totalEmployees } }
//   GET /payroll/my-summary     → { data: { monthlyCTC, currency, latestPayroll: { netPay } | null } | null }
//   GET /attendance/open-session → { session: { id, punchIn, workMode } | null }
//   GET /attendance/my-history  → { records: AttendanceRecord[], pagination: { page, pageSize, total, pages } }
//   GET /admin-users?role=HR_ADMIN → UserAccount[]  (raw array)

export interface StatItem {
  key: string;
  label: string;
  value: number;
  /** Human-readable sub-label, e.g. a timestamp or formatted amount */
  subLabel?: string;
  /** false when the backing table is absent in this deployment */
  available: boolean;
  /** navigation target for the card, when the module has a page */
  href?: string;
  tone: 'blue' | 'green' | 'purple' | 'yellow' | 'red' | 'slate';
}

export interface DashSummary {
  title: string;
  stats: StatItem[];
}

// ---- Response type mirrors ----

// Body of GET /employees. Only the pagination total is consumed here; the
// full data array is intentionally not declared to keep the surface minimal.
interface EmployeesResponse {
  pagination: { total: number };
}

interface CompOffCredit {
  id: number;
  employeeId: number;
  status: string;
  earnedDays: number;
  [key: string]: unknown;
}

// Body of GET /compoff/balance
interface CompOffBalance {
  employeeId: number | null;
  totalEarned: number;
  totalUsed: number;
  totalAdjusted: number;
  available: number;
}

// Body of GET /compoff/my-credits
interface CreditsResponse {
  credits: CompOffCredit[];
  pagination: { total: number };
}

interface PayrollStatsResponse {
  data: {
    totalSalaryStructures: number;
    pendingApproval: number;
    approvedThisMonth: number;
    totalEmployees: number;
  };
}

interface PayrollMySummaryResponse {
  data: {
    monthlyCTC: string;
    currency: string;
    latestPayroll: { netPay: string | number } | null;
  } | null;
}

interface OpenSessionResponse {
  session: { id: string; punchIn: string; workMode: string } | null;
}

interface AttendanceHistoryResponse {
  pagination: { total: number };
}

// ---- Helpers ----

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  }
  return fallback;
}

function toAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function arrayLen(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Silently swallows errors so one failing endpoint never breaks the whole
 * dashboard.  Used for tables that are known to be absent or routes that are
 * not yet wired.
 */
async function safe<T>(promise: Promise<{ data: T }>): Promise<T | null> {
  try {
    const result = await promise;
    return result.data;
  } catch {
    return null;
  }
}

export const dashboardService = {
  // ================================================================
  // Super Admin
  // ================================================================
  async getSuperAdminSummary(): Promise<DashSummary> {
    const [empResp, adminsResp, hrsResp, pendingLeaves, pendingCredits] = await Promise.all([
      safe(api.get<EmployeesResponse>('/employees', { params: { page: 1, pageSize: 1 } })),
      safe(api.get<unknown[]>('/admin-users?role=HR_ADMIN')),
      safe(api.get<unknown[]>('/admin-users?role=HR_ADMIN')),
      safe(api.get<unknown[]>('/leaves/pending')),
      safe(api.get<CompOffCredit[]>('/compoff/pending')),
    ]);

    const totalEmployees = toInt(empResp?.pagination?.total);
    const activeAdmins = arrayLen(adminsResp);
    const hrStaff = arrayLen(hrsResp);
    // HR sees pending leaves + comp-off credits in their queue
    const pendingCount = arrayLen(pendingLeaves) + arrayLen(pendingCredits);

    return {
      title: 'System administration and oversight',
      stats: [
        { key: 'employees', label: 'Total Employees', value: totalEmployees, available: true, href: '/admin/employees', tone: 'blue' },
        { key: 'admins', label: 'Active Admins', value: activeAdmins, available: true, href: '/super-admin/admins', tone: 'green' },
        { key: 'hr', label: 'HR Staff', value: hrStaff, available: true, href: '/super-admin/hrs', tone: 'purple' },
        { key: 'pending', label: 'Pending Approvals', value: pendingCount, available: true, href: '/hr/leaves', tone: 'yellow' },
      ],
    };
  },

  // ================================================================
  // Admin
  // ================================================================
  async getAdminSummary(): Promise<DashSummary> {
    const [empResp, deptResp, desigResp, wfhResp] = await Promise.all([
      safe(api.get<EmployeesResponse>('/employees', { params: { page: 1, pageSize: 1 } })),
      safe(api.get<unknown[]>('/departments')),
      safe(api.get<unknown[]>('/designations')),
      safe(api.get<unknown[]>('/wfh/requests')),
    ]);

    const wfhCount = arrayLen(wfhResp);

    return {
      title: 'Employee and department management',
      stats: [
        {
          key: 'employees', label: 'Total Employees',
          value: toInt(empResp?.pagination?.total),
          available: true, href: '/admin/employees', tone: 'blue',
        },
        {
          key: 'departments', label: 'Departments',
          value: arrayLen(deptResp),
          available: true, href: '/admin/departments', tone: 'green',
        },
        {
          key: 'designations', label: 'Designations',
          value: arrayLen(desigResp),
          available: true, href: '/admin/designations', tone: 'purple',
        },
        // WFH requests are reviewed by HR and above.
        {
          key: 'wfh',
          label: 'WFH Requests',
          value: wfhCount,
          available: true, href: '/admin/wfh', tone: 'slate',
        },
      ],
    };
  },

  // ================================================================
  // HR
  // ================================================================
  async getHrSummary(): Promise<DashSummary> {
    const [pendingLeaves, pendingCredits, payrollResp] = await Promise.all([
      safe(api.get<unknown[]>('/leaves/pending')),
      safe(api.get<CompOffCredit[]>('/compoff/pending')),
      safe(api.get<PayrollStatsResponse>('/payroll/stats')),
    ]);

    const pendingLeavesCount = arrayLen(pendingLeaves);
    const pendingCreditsCount = arrayLen(pendingCredits);
    const pendingPayroll = toInt(payrollResp?.data?.pendingApproval);
    // approvedThisMonth counts payroll_records APPROVED in the current month.
    // It is a payroll metric only — deliberately NOT folded into the comp-off
    // or leave queues, since comp-off credits are a separate workflow.
    const payrollApprovedThisMonth = toInt(payrollResp?.data?.approvedThisMonth);

    return {
      title: 'Human resources operations',
      stats: [
        { key: 'leaves', label: 'Pending Leaves', value: pendingLeavesCount, available: true, href: '/hr/leaves', tone: 'yellow' },
        { key: 'credits', label: 'Pending Comp-Off', value: pendingCreditsCount, available: true, href: '/hr/comp-offs', tone: 'green' },
        {
          key: 'payroll', label: 'Pending Payroll',
          value: pendingPayroll,
          available: !!payrollResp,
          href: '/hr/payroll', tone: 'slate',
        },
        {
          key: 'payrollApproved', label: 'Payroll Runs Approved (This Month)',
          value: payrollApprovedThisMonth,
          available: !!payrollResp,
          href: '/hr/payroll', tone: 'purple',
        },
      ],
    };
  },

  // ================================================================
  // Employee
  // ================================================================
  async getEmployeeSummary(): Promise<DashSummary> {
    const [openSession, compBalance, compCredits, history, payrollResp] = await Promise.all([
      safe(api.get<OpenSessionResponse>('/attendance/open-session')),
      safe(api.get<CompOffBalance>('/compoff/balance')),
      safe(api.get<CreditsResponse>('/compoff/my-credits')),
      safe(api.get<AttendanceHistoryResponse>('/attendance/my-history', { params: { page: 1 } })),
      safe(api.get<PayrollMySummaryResponse>('/payroll/my-summary')),
    ]);

    const session = openSession?.session;
    const punchInTime = session?.punchIn
      ? new Date(session.punchIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;
    const compAvailable = toInt(compBalance?.available);
    const compCreditsCount = arrayLen(compCredits?.credits);
    const attendanceTotal = toInt(history?.pagination?.total);
    const latestNetPay = toAmount(payrollResp?.data?.latestPayroll?.netPay);
    // Amount is rendered as the currency-formatted sub-label on the card.
    const payslipAmount = payrollResp?.data?.latestPayroll
      ? `₹${latestNetPay.toLocaleString('en-IN')}`
      : null;

    return {
      title: 'Your self-service portal',
      stats: [
        {
          key: 'punch',
          label: punchInTime ? `Punched In ${punchInTime}` : 'Not Punched In',
          value: punchInTime ? 1 : 0,
          subLabel: punchInTime ? `Started ${punchInTime}` : undefined,
          available: true,
          href: '/employee/attendance',
          tone: punchInTime ? 'green' : 'yellow',
        },
        {
          key: 'compoff',
          label: 'Comp-Off Available',
          value: compAvailable,
          subLabel: compCreditsCount > 0 ? `${compCreditsCount} credited` : undefined,
          available: true,
          href: '/employee/comp-offs',
          tone: 'purple',
        },
        {
          key: 'attendance',
          label: 'Attendance Records',
          value: attendanceTotal,
          available: true,
          href: '/employee/attendance',
          tone: 'blue',
        },
        {
          key: 'payslip',
          label: 'Latest Net Pay',
          value: latestNetPay,
          subLabel: payslipAmount ?? undefined,
          available: !!payrollResp?.data,   // real data when payroll module is wired
          href: '/employee/payslips',
          tone: latestNetPay > 0 ? 'green' : 'slate',
        },
      ],
    };
  },
};
