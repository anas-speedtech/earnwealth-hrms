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
  employeeId: string;
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

export interface PayrollSummary {
  monthlyCTC: string;
  currency: string;
  latestPayroll: PayrollRecordItem | null;
}

// ---- Service ----

export const payrollService = {
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
      `${API_BASE_URL}/api/payroll/salary-structures`,
      payload,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async getSalaryStructure(employeeId: string): Promise<SalaryStructureItem> {
    const session = getSession();
    const { data } = await axios.get<{ data: SalaryStructureItem }>(
      `${API_BASE_URL}/api/payroll/salary-structures/${employeeId}`,
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
      `${API_BASE_URL}/api/payroll/salary-structures/${structureId}`,
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
      `${API_BASE_URL}/api/payroll/salary-structures`,
      {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
        params,
      }
    );
    return data.data;
  },

  // ---- Payroll Records ----

  async createPayroll(payload: { employeeId: string; month: number; year: number }): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/api/payroll/records`,
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
  }): Promise<PayrollRecordItem[]> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem[] }>(
      `${API_BASE_URL}/api/payroll/records/bulk`,
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
      `${API_BASE_URL}/api/payroll/records/${payrollId}/components`,
      { overrides },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async submitForApproval(payrollId: string): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/api/payroll/records/${payrollId}/submit`,
      {},
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async approvePayroll(payrollId: string, comment = ''): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/api/payroll/records/${payrollId}/approve`,
      { comment },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async rejectPayroll(payrollId: string, reason: string): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.post<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/api/payroll/records/${payrollId}/reject`,
      { comment: reason },
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async getPayroll(payrollId: string): Promise<PayrollRecordItem> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayrollRecordItem }>(
      `${API_BASE_URL}/api/payroll/records/${payrollId}`,
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
      `${API_BASE_URL}/api/payroll/records`,
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
      `${API_BASE_URL}/api/payroll/payslips/${payrollId}`,
      {},
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async getPayslip(payslipId: string): Promise<PayslipItem> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayslipItem }>(
      `${API_BASE_URL}/api/payroll/payslips/${payslipId}`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async getMyPayslip(month: number, year: number): Promise<PayslipItem> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayslipItem }>(
      `${API_BASE_URL}/api/payroll/my-payslip`,
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
      `${API_BASE_URL}/api/payroll/my-payslips`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  // ---- PDF Download ----

  async downloadPayslipPDF(payslipId: string, filename: string): Promise<void> {
    const session = getSession();
    await axios.get(`${API_BASE_URL}/api/payroll/payslips/${payslipId}/pdf`, {
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

  // ---- Stats ----

  async getDashboardStats(): Promise<PayrollDashboardStats> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayrollDashboardStats }>(
      `${API_BASE_URL}/api/payroll/stats`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },

  async getMyPayrollSummary(): Promise<PayrollSummary | null> {
    const session = getSession();
    const { data } = await axios.get<{ data: PayrollSummary | null }>(
      `${API_BASE_URL}/api/payroll/my-summary`,
      { headers: { Authorization: `Bearer ${session?.accessToken}` } }
    );
    return data.data;
  },
};
