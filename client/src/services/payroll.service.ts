import axios from 'axios';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../utils/constants';

const SESSION_KEY = 'ews_session';

function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---- Types ----

export interface SalaryComponentItem {
  id: string;
  name: string;
  description: string | null;
  type: 'EARNING' | 'DEDUCTION';
  calculationType: string;
  amount: string;
  percentage: number | null;
  formula: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface SalaryStructureItem {
  id: string;
  /** employees.id — the picker key (the profile id is no longer exposed). */
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  monthlyCTC: string;
  currency: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  components: SalaryComponentItem[];
}

export interface PaginatedSalaryStructures {
  structures: SalaryStructureItem[];
  pagination: { page: number; pages: number; total: number };
}

export interface PayrollComponentItem {
  id: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  amount: string;
  sortOrder: number;
}

export interface PayrollRecordItem {
  id: string;
  employeeId: string;
  salaryStructureId: string;
  periodId: string | null;
  month: number;
  year: number;
  status: string;
  grossEarnings: string;
  totalDeductions: string;
  netPay: string;
  preparedBy: string;
  preparedAt: string;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  reviewComment: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  paidAt: string | null;
  createdAt: string;
  components: PayrollComponentItem[];
}

export interface PaginatedPayrollRecords {
  payrolls: PayrollRecordItem[];
  pagination: { page: number; pages: number; total: number };
}

export interface PayslipItem {
  id: string;
  payrollRecordId: string;
  employeeId: string;
  month: number;
  year: number;
  pdfPath: string | null;
  generatedBy: string;
  generatedAt: string;
  payroll: PayrollRecordItem | null;
}

export interface PayrollDashboardStats {
  totalSalaryStructures: number;
  pendingApproval: number;
  approvedThisMonth: number;
  totalEmployees: number;
}

// ---- PF / ESIC deduction report ----

export interface StatutoryReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  pfEmployee: number;
  esiEmployee: number;
  pfEmployer: number;
  esiEmployer: number;
  totalDeduction: number;
  totalEmployer: number;
}

export interface StatutoryDeductionReport {
  month: number;
  year: number;
  employees: StatutoryReportRow[];
  totals: {
    pfEmployee: number;
    esiEmployee: number;
    pfEmployer: number;
    esiEmployer: number;
    totalDeductions: number;
    totalEmployer: number;
  };
}

// A "salary header" — one entry of the organisation-wide payhead catalog
// (Basic, HRA, PF...). HR configures this list; the salary-structure form
// then offers these headers instead of free-text components.
export interface SalaryPayhead {
  id: string;
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  description: string;
  /** Calculation formula (e.g. "CTC*50%") — blank means a fixed-amount line. */
  formula: string;
  isFixedByDefault: boolean;
  sortOrder: number;
  isActive: boolean;
}

// A configuration-change history row (payhead / salary-rule edits).
export interface ConfigAuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

// The organisation's configurable salary split (the "Salary Configuration").
// Stored server-side in a single row; HR edits it from the Payroll page.
export interface SalaryRules {
  basicPct: number;
  hraPctOfBasic: number;
  pfPct: number;
  pfCap: number;
  esicEmployerPct: number;
  esicEmployeePct: number;
  esicWageCeiling: number;
  professionTax: number;
  workingDaysMonth: number;
  notes: string;
}

export interface SalarySplitPreview {
  ctc: number;
  earnings: { name: string; code: string; type: string; amount: number }[];
  deductions: { name: string; code: string; type: string; amount: number }[];
  employerContributions: { name: string; code: string; type: string; amount: number }[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
}

export interface PayrollSummary {
  currency: string;
  latestPayroll: PayrollRecordItem | null;
}

// A payroll period is the month-level run that HR drives through the
// lifecycle: DRAFT -> CALCULATED -> UNDER_REVIEW -> PENDING_APPROVAL ->
// APPROVED -> LOCKED -> PAID, with an authorized-unlock path back.
export interface PayrollPeriod {
  id: number;
  month: number;
  year: number;
  payrollGroup: string | null;
  status: 'DRAFT' | 'CALCULATED' | 'UNDER_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'LOCKED' | 'PAID';
  hrReviewedAt: string | null;
  hrReviewedBy: number | null;
  financeReviewedAt: string | null;
  financeReviewedBy: number | null;
  lockedAt: string | null;
  lockedBy: number | null;
  paidAt: string | null;
  unlockedAt: string | null;
  unlockedBy: number | null;
  unlockReason: string | null;
  createdBy: number | null;
  createdAt: string;
}

// One-time earnings/deductions queued for a pay run (bonuses, arrears,
// advances...). `payrollRecordId` is null until the record that consumed it.
export interface OneTimeAdjustment {
  id: number;
  employeeId: number;
  payrollRecordId: number | null;
  type: 'ONE_TIME_EARNING' | 'ONE_TIME_DEDUCTION' | 'BONUS' | 'INCENTIVE' | 'ARREARS' | 'SALARY_ADVANCE';
  amount: string;
  reason: string | null;
  approvedBy: number | null;
  appliedAt: string | null;
  createdAt: string;
}

export interface EmployeeLoan {
  id: number;
  employeeId: number;
  loanType: 'LOAN' | 'ADVANCE';
  principalAmount: string;
  outstandingAmount: string;
  emiAmount: string;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'CLOSED';
  createdAt: string;
}

export interface EmployeeReimbursement {
  id: number;
  employeeId: number;
  componentCode: string | null;
  claimDate: string;
  amount: string;
  description: string | null;
  receiptPath: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy: number | null;
  approvedAt: string | null;
  payrollRecordId: number | null;
  createdAt: string;
}

export interface StatutorySetting {
  id: number;
  statutoryType: 'EPF' | 'EPS' | 'EDLI' | 'PF_ADMIN' | 'ESI' | 'PT' | 'LWF' | 'TDS' | 'GRATUITY' | 'BONUS';
  stateCode: string | null;
  employeeRate: string;
  employerRate: string;
  wageBasis: string;
  wageCeiling: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

export interface EmployeePayrollProfile {
  id: number; employeeId: number; pan: string | null; uan: string | null; esicNumber: string | null;
  bankName: string | null;
  bankAccountMasked: string | null; bankIfsc: string | null; taxRegime: 'OLD' | 'NEW';
  pfApplicable: boolean; esiApplicable: boolean; voluntaryPfRate: string | null; salaryOnHold: boolean; holdReason: string | null;
  stateCode: string | null;
  // ---- Professional Tax context (state- + category-specific) ----
  gender: 'MALE' | 'FEMALE' | null;
  ptApplicable: boolean;
  workLocation: string | null;
  ptCategory: 'MALE' | 'FEMALE' | null;
  ptExempt: boolean;
  ptExemptionCategory: string | null;
  ptExemptionValidFrom: string | null;
  ptExemptionValidUntil: string | null;
  ptExemptionDocument: string | null;
  ptExemptionApprovedBy: number | null;
  ptExemptionStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}

// ---- Professional Tax (PT) dashboard + reports + compliance ----

export interface PTDashboard {
  month: number;
  year: number;
  fiscalYear: string;
  stateCode: string | null;
  currentMonth: {
    totalPTDeducted: number;
    februaryAdjustment: number;
    exemptionAmount: number;
    employees: number;
    exemptEmployees: number;
  };
  employer: {
    totalPTPayable: number;
    totalPTPaid: number;
    outstanding: number;
    filingStatus: string;
    nextDeadline: string | null;
    paymentDeadline: string | null;
    frequency: string | null;
  };
  stateWise: { stateCode: string; finalPT: number; employeeCount: number; exempt: number }[];
  employeeWise: { employeeCode: string; employeeName: string; stateCode: string; finalPT: number; isExempt: boolean }[];
  upcomingDeadlines: { stateCode: string; type: string; deadline: string | null; status: string }[];
}

export interface PTMonthlyEmployeeRow {
  employeeCode: string; employeeName: string; stateCode: string; category: string;
  taxableBasis: number; normalPT: number; februaryAdjustment: number; exemption: number;
  finalPT: number; isExempt: boolean;
}
export interface PTMonthlyStateRow {
  stateCode: string; finalPT: number; employeeCount: number; exemptCount: number;
}
export interface PTFiscalEmployeeRow {
  employeeCode: string; employeeName: string; stateCode: string; totalPT: number; totalExemption: number; months: number;
}
export interface PTReconciliation {
  stateCode: string; fiscalYearStart: number; totalPayable: number; totalPaid: number;
  outstanding: number; filingStatus: string;
}
export interface PTFilingRow {
  stateCode: string; financialYear: string; frequency: string; basisLiability: number;
  payable: number; paid: number; outstanding: number; status: string;
  nextDeadline: string | null; paymentDeadline: string | null; lateFee: number; interest: number;
  returnReference: string | null; challanReference: string | null;
}
export interface PTExemptionRow {
  profileId: string; employeeId: string; employeeCode: string; name: string; email: string;
  stateCode: string | null; ptExempt: boolean; status: string | null;
  category: string | null; provision: string | null; validFrom: string | null; validUntil: string | null;
  approvedBy: number | null;
}

// ---- Salary tab "Calculate" result ----

export interface SalaryCalculateComponent {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  formula: string | null;
  monthly: number;
  annual: number;
  displayOnPayslip: boolean;
}

export interface SalaryCalculateResult {
  monthlyCTC: number;
  annualCTC: number;
  components: SalaryCalculateComponent[];
  totals: {
    grossMonthly: number; grossAnnual: number;
    deductionsMonthly: number; deductionsAnnual: number;
    netMonthly: number; netAnnual: number;
  };
  persisted: { structureId: number } | null;
}

// ---- Employee documents (optional uploads per slot) ----

export type EmployeeDocKind = 'AADHAAR' | 'PAN' | 'ADDRESS_PROOF' | 'BANK_DETAILS' | 'OTHER_1' | 'OTHER_2';

export interface EmployeeDocumentMeta {
  kind: string;
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  hasFile: boolean;
}

export interface EmployeeDocumentFile {
  kind: string;
  fileName: string;
  mimeType: string;
  /** base64 data URL of the stored file. */
  dataUrl: string;
}

export interface AttendancePayrollInputs {
  totalCalendarDays: number; workingDays: number; presentDays: number; paidLeaveDays: number;
  unpaidLeaveDays: number; lopDays: number; halfDays: number; prorationFactor: number;
  /** Last day of the month counted for proration (PAYROLL_CUTOFF_DAY). */
  cutoffDay?: number;
  warnings: string[];
}

// ---- Service ----

export const payrollService = {
  // ---- Statutory settings ----
  async listStatutorySettings(params: { statutoryType?: string; stateCode?: string; asOf?: string } = {}): Promise<StatutorySetting[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: StatutorySetting[] }>(`${API_BASE_URL}/payroll/statutory-settings`, { headers: { Authorization: `Bearer ${session?.accessToken}` }, params });
    return data.data;
  },

  async createStatutorySetting(payload: Record<string, unknown>): Promise<StatutorySetting> {
    const session = getSession();
    const { data } = await axios.post<{ data: StatutorySetting }>(`${API_BASE_URL}/payroll/statutory-settings`, payload, { headers: { Authorization: `Bearer ${session?.accessToken}` } });
    return data.data;
  },

  async updateStatutorySetting(id: number, payload: Record<string, unknown>): Promise<StatutorySetting> {
    const session = getSession();
    const { data } = await axios.put<{ data: StatutorySetting }>(`${API_BASE_URL}/payroll/statutory-settings/${id}`, payload, { headers: { Authorization: `Bearer ${session?.accessToken}` } });
    return data.data;
  },

  async getEmployeePayrollProfile(employeeId: string): Promise<EmployeePayrollProfile | null> {
    const session = getSession();
    const { data } = await axios.get<{ data: EmployeePayrollProfile | null }>(`${API_BASE_URL}/payroll/employees/${employeeId}/profile`, { headers: { Authorization: `Bearer ${session?.accessToken}` } });
    return data.data;
  },

  async saveEmployeePayrollProfile(employeeId: string, payload: Partial<EmployeePayrollProfile>): Promise<EmployeePayrollProfile> {
    const session = getSession();
    const { data } = await axios.put<{ data: EmployeePayrollProfile }>(`${API_BASE_URL}/payroll/employees/${employeeId}/profile`, payload, { headers: { Authorization: `Bearer ${session?.accessToken}` } });
    return data.data;
  },

  /**
   * Salary-tab "Calculate": builds the component set from the configured
   * payhead formulas, evaluates against the entered CTC. With persist, the
   * result becomes the employee's open salary structure.
   */
  async calculateSalary(
    employeeId: string,
    monthlyCTC: number,
    options: { persist?: boolean; overrides?: { code: string; amount?: number | null; formula?: string | null; included?: boolean }[] } = {},
  ): Promise<SalaryCalculateResult> {
    const session = getSession();
    const { data } = await axios.post<{ data: SalaryCalculateResult }>(
      `${API_BASE_URL}/payroll/salary-calculate`,
      { employeeId: Number(employeeId), monthlyCTC, persist: options.persist || false, overrides: options.overrides || [] },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } },
    );
    return data.data;
  },

  // ---- Employee documents ----

  async listEmployeeDocuments(employeeId: string): Promise<EmployeeDocumentMeta[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: EmployeeDocumentMeta[] }>(`${API_BASE_URL}/payroll/employees/${employeeId}/documents`, { headers: { Authorization: `Bearer ${session?.accessToken}` } });
    return data.data;
  },

  async uploadEmployeeDocument(employeeId: string, kind: string, dataUrl: string, fileName: string): Promise<EmployeeDocumentMeta> {
    const session = getSession();
    const { data } = await axios.post<{ data: EmployeeDocumentMeta }>(
      `${API_BASE_URL}/payroll/employees/${employeeId}/documents`,
      { kind, file: dataUrl, fileName },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } },
    );
    return data.data;
  },

  async getEmployeeDocument(employeeId: string, kind: string): Promise<EmployeeDocumentFile | null> {
    const session = getSession();
    try {
      const { data } = await axios.get<{ data: EmployeeDocumentFile | null }>(`${API_BASE_URL}/payroll/employees/${employeeId}/documents/${kind}`, { headers: { Authorization: `Bearer ${session?.accessToken}` } });
      return data.data;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      throw err;
    }
  },

  async removeEmployeeDocument(employeeId: string, kind: string): Promise<{ removed: boolean }> {
    const session = getSession();
    const { data } = await axios.delete<{ data: { removed: boolean } }>(`${API_BASE_URL}/payroll/employees/${employeeId}/documents/${kind}`, { headers: { Authorization: `Bearer ${session?.accessToken}` } });
    return data.data;
  },

  async getAttendancePayrollInputs(employeeId: string, month: number, year: number): Promise<AttendancePayrollInputs> {
    const session = getSession();
    const { data } = await axios.get<{ data: AttendancePayrollInputs }>(`${API_BASE_URL}/payroll/employees/${employeeId}/attendance-inputs`, { headers: { Authorization: `Bearer ${session?.accessToken}` }, params: { month, year } });
    return data.data;
  },

  // ---- Salary Structure ----

  async createSalaryStructure(payload: {
    employeeId: string;
    monthlyCTC: number;
    currency?: string;
    isActive?: boolean;
    effectiveFrom: string;
    effectiveTo?: string | null;
    components: Array<{
      name: string;
      description?: string;
      type: 'EARNING' | 'DEDUCTION';
      calculationType?: string;
      amount?: number | null;
      percentage?: number | null;
      formula?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    }>;
  }): Promise<SalaryStructureItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: SalaryStructureItem }>(
      `${API_BASE_URL}/payroll/salary-structures`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async getSalaryStructure(employeeId: string): Promise<SalaryStructureItem> {
    const session = getSession();
    const { data } = await axios.get<{ data: SalaryStructureItem }>(
      `${API_BASE_URL}/payroll/salary-structures/${employeeId}`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async updateSalaryStructure(structureId: string, payload: {
    monthlyCTC?: number;
    currency?: string;
    isActive?: boolean;
    effectiveFrom?: string;
    effectiveTo?: string | null;
  }): Promise<SalaryStructureItem> {
    const session = getSession();
    const { data } = await axios.put<{ data: SalaryStructureItem }>(
      `${API_BASE_URL}/payroll/salary-structures/${structureId}`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async listSalaryStructures(params: {
    page?: number;
    departmentId?: string;
    search?: string;
  } = {}): Promise<PaginatedSalaryStructures> {
    const session = getSession();
    const { data } = await axios.get<{ data: PaginatedSalaryStructures }>(
      `${API_BASE_URL}/payroll/salary-structures`,
      {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
        params,
      }
    );
    return data.data;
  },

  // ---- Payroll Records ----

  async createPayroll(payload: { employeeId: string; month: number; year: number; applyAttendanceProration?: boolean }): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/payroll/records`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async bulkCreatePayroll(payload: {
    departmentId?: string;
    employeeIds: string[];
    month: number;
    year: number;
    applyAttendanceProration?: boolean;
  }): Promise<PayrollRecordItem[]> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem[] }>(
      `${API_BASE_URL}/payroll/records/bulk`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async updatePayrollComponents(
    payrollId: string,
    overrides: Array<{ id: string; amount: number }>
  ): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.put<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/payroll/records/${payrollId}/components`,
      { overrides },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async submitForApproval(payrollId: string): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/payroll/records/${payrollId}/submit`,
      {},
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async approvePayroll(payrollId: string, comment = ''): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/payroll/records/${payrollId}/approve`,
      { comment },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async rejectPayroll(payrollId: string, reason: string): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/payroll/records/${payrollId}/reject`,
      { comment: reason },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // Record-level lifecycle: freeze (lock) / authorized reopen (unlock) /
  // disbursement moment (paid).
  async lockPayroll(payrollId: string): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/payroll/records/${payrollId}/lock`,
      {},
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async unlockPayroll(payrollId: string, reason: string): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/payroll/records/${payrollId}/unlock`,
      { comment: reason },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async markPayrollPaid(payrollId: string): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/payroll/records/${payrollId}/paid`,
      {},
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async getPayroll(payrollId: string): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/payroll/records/${payrollId}`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- Payroll period lifecycle ----

  async getOrCreatePayrollPeriod(payload: { month: number; year: number; payrollGroup?: string | null }): Promise<PayrollPeriod> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollPeriod }>(
      `${API_BASE_URL}/payroll/periods`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async transitionPayrollPeriod(periodId: number, status: PayrollPeriod['status'], reason = ''): Promise<PayrollPeriod> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollPeriod }>(
      `${API_BASE_URL}/payroll/periods/${periodId}/transition`,
      { status, reason },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async recordPayrollPeriodReview(periodId: number, gate: 'HR_REVIEW' | 'FINANCE_REVIEW'): Promise<PayrollPeriod> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollPeriod }>(
      `${API_BASE_URL}/payroll/periods/${periodId}/review`,
      { gate },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- One-time adjustments ----

  async listOneTimeAdjustments(params: { employeeId?: number; status?: 'APPLIED' | 'PENDING' } = {}): Promise<OneTimeAdjustment[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: OneTimeAdjustment[] }>(
      `${API_BASE_URL}/payroll/one-time-adjustments`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` }, params }
    );
    return data.data;
  },

  async createOneTimeAdjustment(payload: {
    employeeId: number;
    type: OneTimeAdjustment['type'];
    amount: number;
    reason?: string | null;
  }): Promise<OneTimeAdjustment> {
    const session = getSession();
    const { data } = await axios.post<{ data: OneTimeAdjustment }>(
      `${API_BASE_URL}/payroll/one-time-adjustments`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- Loans / advances ----

  async listEmployeeLoans(employeeId: string): Promise<EmployeeLoan[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: EmployeeLoan[] }>(
      `${API_BASE_URL}/payroll/employees/${employeeId}/loans`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async createEmployeeLoan(employeeId: string, payload: {
    loanType?: 'LOAN' | 'ADVANCE';
    principalAmount: number;
    emiAmount: number;
    startDate: string;
    endDate?: string | null;
  }): Promise<EmployeeLoan> {
    const session = getSession();
    const { data } = await axios.post<{ data: EmployeeLoan }>(
      `${API_BASE_URL}/payroll/employees/${employeeId}/loans`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async recordLoanRepayment(loanId: number, payload: { amount: number; paidOn?: string; payrollRecordId?: number | null }): Promise<unknown> {
    const session = getSession();
    const { data } = await axios.post<{ data: unknown }>(
      `${API_BASE_URL}/payroll/loans/${loanId}/repayments`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- Reimbursements ----

  async listReimbursements(params: { employeeId?: number; status?: string } = {}): Promise<EmployeeReimbursement[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: EmployeeReimbursement[] }>(
      `${API_BASE_URL}/payroll/reimbursements`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` }, params }
    );
    return data.data;
  },

  async createReimbursement(payload: {
    employeeId: number;
    componentCode?: string | null;
    claimDate: string;
    amount: number;
    description?: string | null;
    receiptPath?: string | null;
  }): Promise<EmployeeReimbursement> {
    const session = getSession();
    const { data } = await axios.post<{ data: EmployeeReimbursement }>(
      `${API_BASE_URL}/payroll/reimbursements`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async reviewReimbursement(id: number, action: 'approve' | 'reject'): Promise<EmployeeReimbursement> {
    const session = getSession();
    const { data } = await axios.post<{ data: EmployeeReimbursement }>(
      `${API_BASE_URL}/payroll/reimbursements/${id}/${action}`,
      {},
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- Period password lock ----

  async lockPeriodWithPassword(periodId: number, password: string): Promise<{ period: PayrollPeriod; lockedRecords: number }> {
    const session = getSession();
    const { data } = await axios.post<{ data: { period: PayrollPeriod; lockedRecords: number } }>(
      `${API_BASE_URL}/payroll/periods/${periodId}/lock`,
      { password },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- Bulk payslip generation ----

  async generateBulkPayslips(periodId: number): Promise<Array<{ id: number; payrollRecordId: number; employeeId: number; employeeCode: string | null; month: number; year: number; generatedAt: string }>> {
    const session = getSession();
    const { data } = await axios.post<{ data: Array<{ id: number; payrollRecordId: number; employeeId: number; employeeCode: string | null; month: number; year: number; generatedAt: string }> }>(
      `${API_BASE_URL}/payroll/periods/${periodId}/generate-payslips`,
      {},
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- HR reopen (authorized unlock of a locked period) ----

  async reopenLockedPeriod(periodId: number, reason: string): Promise<{ period: PayrollPeriod; reopenedRecords: number }> {
    const session = getSession();
    const { data } = await axios.post<{ data: { period: PayrollPeriod; reopenedRecords: number } }>(
      `${API_BASE_URL}/payroll/periods/${periodId}/reopen`,
      { reason },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async listPayrolls(params: {
    page?: number;
    employeeId?: string;
    month?: number;
    year?: number;
    status?: string;
    departmentId?: string;
    search?: string;
  } = {}): Promise<PaginatedPayrollRecords> {
    const session = getSession();
    const { data } = await axios.get<{ data: PaginatedPayrollRecords }>(
      `${API_BASE_URL}/payroll/records`,
      {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
        params,
      }
    );
    return data.data;
  },

  // ---- Payslips ----

  async generatePayslip(payrollId: string): Promise<PayslipItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayslipItem }>(
      `${API_BASE_URL}/payroll/payslips/${payrollId}`,
      {},
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async getPayslip(payslipId: string): Promise<PayslipItem> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayslipItem }>(
      `${API_BASE_URL}/payroll/payslips/${payslipId}`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async getMyPayslip(month: number, year: number): Promise<PayslipItem> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayslipItem }>(
      `${API_BASE_URL}/payroll/my-payslip`,
      {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
        params: { month, year },
      }
    );
    return data.data;
  },

  async listMyPayslips(): Promise<{ payslips: PayslipItem[] }> {
    const session = getSession();
    const { data } = await axios.get<{ data: { payslips: PayslipItem[] } }>(
      `${API_BASE_URL}/payroll/my-payslips`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- PDF Download ----

  async downloadPayslipPDF(payslipId: string, filename: string): Promise<void> {
    const session = getSession();
    await axios.get(`${API_BASE_URL}/payroll/payslips/${payslipId}/pdf`, {
      headers: { Authorization: `Bearer ${session?.accessToken}` },
      responseType: 'blob',
    }).then((response) => {
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }).catch((err) => {
      const message = err.response?.data?.error?.message || 'Failed to download payslip.';
      toast.error(message);
      throw new Error(message);
    });
  },

  // ---- Salary Payheads ("salary headers") ----

  // ---- Salary rules (the configurable salary split) ----

  async getSalaryRules(): Promise<SalaryRules> {
    const session = getSession();
    const { data } = await axios.get<{ data: SalaryRules }>(
      `${API_BASE_URL}/payroll/salary-rules`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async updateSalaryRules(payload: Partial<SalaryRules>): Promise<SalaryRules> {
    const session = getSession();
    const { data } = await axios.put<{ data: SalaryRules }>(
      `${API_BASE_URL}/payroll/salary-rules`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async previewSalarySplit(ctc: number): Promise<SalarySplitPreview> {
    const session = getSession();
    const { data } = await axios.post<{ data: SalarySplitPreview }>(
      `${API_BASE_URL}/payroll/salary-rules/preview`,
      { ctc },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async listPayheads(params: { activeOnly?: boolean } = {}): Promise<SalaryPayhead[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: SalaryPayhead[] }>(
      `${API_BASE_URL}/payroll/payheads`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` }, params }
    );
    return data.data;
  },

  async createPayhead(payload: {
    code: string;
    name: string;
    type: 'EARNING' | 'DEDUCTION';
    description?: string | null;
    /** Calculation formula, e.g. "CTC*50%" — blank = fixed-amount line. */
    formula?: string | null;
    isFixedByDefault?: boolean;
    sortOrder?: number;
  }): Promise<SalaryPayhead> {
    const session = getSession();
    const { data } = await axios.post<{ data: SalaryPayhead }>(
      `${API_BASE_URL}/payroll/payheads`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  /**
   * Config-level complete-calculation preview: the full component set the way
   * it will run, with one component's in-progress edit applied (no employee,
   * nothing persisted). Shown in the Salary Components edit modal.
   */
  async previewPayheadEdit(payload: {
    monthlyCTC: number;
    payheadCode?: string | null;
    formula?: string | null;
    included?: boolean;
  }): Promise<SalaryCalculateResult> {
    const session = getSession();
    const { data } = await axios.post<{ data: SalaryCalculateResult }>(
      `${API_BASE_URL}/payroll/payheads/preview`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async updatePayhead(id: string, payload: {
    name?: string;
    type?: 'EARNING' | 'DEDUCTION';
    description?: string | null;
    formula?: string | null;
    isFixedByDefault?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<SalaryPayhead> {
    const session = getSession();
    const { data } = await axios.put<{ data: SalaryPayhead }>(
      `${API_BASE_URL}/payroll/payheads/${id}`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async deletePayhead(id: string): Promise<void> {
    const session = getSession();
    await axios.delete(`${API_BASE_URL}/payroll/payheads/${id}`, {
      headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
  },

  /** Configuration change history — payhead / salary-rule edits (newest first). */
  async listConfigAudit(limit = 50): Promise<ConfigAuditEntry[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: ConfigAuditEntry[] }>(`${API_BASE_URL}/payroll/config-audit`, {
      params: { limit },
      headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  // ---- Stats ----

  async getDashboardStats(): Promise<PayrollDashboardStats> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayrollDashboardStats }>(
      `${API_BASE_URL}/payroll/stats`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // PF / ESIC deduction report for a month (per-employee breakdown + totals).
  async getStatutoryDeductionReport(month: number, year: number): Promise<StatutoryDeductionReport> {
    const session = getSession();
    const { data } = await axios.get<{ data: StatutoryDeductionReport }>(
      `${API_BASE_URL}/payroll/statutory-report`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` }, params: { month, year } }
    );
    return data.data;
  },

  async getMyPayrollSummary(): Promise<PayrollSummary | null> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayrollSummary | null }>(
      `${API_BASE_URL}/payroll/my-summary`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- Professional Tax (PT): dashboard, reports, exemptions, filings ----

  async getPTDashboard(params: { stateCode?: string; month?: number; year?: number }): Promise<PTDashboard> {
    const session = getSession();
    const { data } = await axios.get<{ data: PTDashboard }>(`${API_BASE_URL}/payroll/pt/dashboard`, {
      params, headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async getPTMonthlyEmployeeReport(params: { stateCode?: string; month: number; year: number }): Promise<PTMonthlyEmployeeRow[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: PTMonthlyEmployeeRow[] }>(`${API_BASE_URL}/payroll/pt/reports/monthly-employee`, {
      params, headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async getPTMonthlyStateReport(params: { month: number; year: number }): Promise<PTMonthlyStateRow[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: PTMonthlyStateRow[] }>(`${API_BASE_URL}/payroll/pt/reports/monthly-state`, {
      params, headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async getPTFiscalYearEmployeeReport(params: { fiscalYearStart?: number; stateCode?: string }): Promise<PTFiscalEmployeeRow[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: PTFiscalEmployeeRow[] }>(`${API_BASE_URL}/payroll/pt/reports/fiscal-year-employee`, {
      params, headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async getPTReconciliationReport(params: { stateCode?: string; fiscalYearStart?: number }): Promise<PTReconciliation[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: PTReconciliation[] }>(`${API_BASE_URL}/payroll/pt/reports/reconciliation`, {
      params, headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async getPTExemptions(): Promise<PTExemptionRow[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: PTExemptionRow[] }>(`${API_BASE_URL}/payroll/pt/reports/exemptions`, {
      headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async getPTComplianceReport(): Promise<PTFilingRow[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: PTFilingRow[] }>(`${API_BASE_URL}/payroll/pt/reports/compliance`, {
      headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async listPTExemptions(status?: string): Promise<PTExemptionRow[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: PTExemptionRow[] }>(`${API_BASE_URL}/payroll/pt/exemptions`, {
      params: status ? { status } : undefined,
      headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async reviewPTExemption(payload: { employeeId: string; approved: boolean; comment?: string }): Promise<unknown> {
    const session = getSession();
    const { data } = await axios.post<{ data: unknown }>(`${API_BASE_URL}/payroll/pt/exemptions/review`, payload, {
      headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async upsertPTFiling(payload: { stateCode: string; financialYearStart: number; prevYearLiability?: number }): Promise<unknown> {
    const session = getSession();
    const { data } = await axios.post<{ data: unknown }>(`${API_BASE_URL}/payroll/pt/filings`, payload, {
      headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },

  async listPTFilings(): Promise<PTFilingRow[]> {
    const session = getSession();
    const { data } = await axios.get<{ data: PTFilingRow[] }>(`${API_BASE_URL}/payroll/pt/filings`, {
      headers: { Authorization: `Bearer ${session?.accessToken}` },
    });
    return data.data;
  },
};
