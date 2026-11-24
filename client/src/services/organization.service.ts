import api from './api';

export interface Employee {
  id: string;
  userId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  grade?: string;
  phoneNumber?: string;
  personalEmail?: string;
  address?: string;
  department?: { id: string; name: string } | null;
  designation?: { id: string; name: string } | null;
  manager?: { id: string; name: string } | null;
  employmentType?: string;
  joiningDate: string;
  status: string;
  accountStatus: string;
  basicSalary?: number | string;
  allowances?: number | string;
  deductions?: number | string;
}

export interface EmployeeDetail extends Employee {
  dateOfBirth?: string;
  gender?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  employeeCount: number;
}

export interface Designation {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  employeeCount: number;
}

// ---- Payout Details (earnings/deduction structure + bank, HR-maintained) ----

export interface PayoutLine {
  label: string;
  amount: number;
}

export interface PayoutDetail {
  employeeCode: string;
  employeeName: string;
  earnings: PayoutLine[];
  deductions: PayoutLine[];
  grossEarnings: number;
  grossDeductions: number;
  takeHome: number;
  bankName: string;
  accountNumber: string;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PayoutSnapshot {
  earnings: PayoutLine[];
  deductions: PayoutLine[];
  bankName: string;
  accountNumber: string;
}

// Personal-profile fields maintained by HR on the employee-detail page
// (employees are view-only here). DOB lives in this table, not the legacy
// employees table.
export interface PersonalProfileData {
  address: string;
  dateOfBirth: string;
  emergencyContact: string;
  personalEmail: string;
  anniversaryDate: string;
}

export interface PayoutHistoryEntry {
  id: string;
  version: number;
  action: string;
  actorName: string;
  actorRole: string;
  confirmedCode: string;
  createdAt: string;
  before: PayoutSnapshot | null;
  after: PayoutSnapshot | null;
  grossEarnings?: number;
  grossDeductions?: number;
  takeHome?: number;
}

export interface LeaveType {
  id: string;
  name: string;
  code?: string;
  type: string;
  annualEntitlementDays: number;
  isUnlimited: boolean;
  isActive: boolean;
}

export const organizationService = {
  // ---- Leave Types ----

  async getLeaveTypes(): Promise<LeaveType[]> {
    const { data } = await api.get<LeaveType[]>('/leave-types');
    return data;
  },
  async getEmployees(params: {
    page?: number;
    search?: string;
    departmentId?: string;
    designationId?: string;
    status?: string;
  } = {}): Promise<PaginatedResponse<Employee>> {
    const { data } = await api.get('/employees', { params });
    return data;
  },

  async getEmployee(id: string): Promise<EmployeeDetail> {
    const { data } = await api.get(`/employees/${id}`);
    return data;
  },

  async createEmployee(payload: {
    employeeCode: string;
    firstName: string;
    lastName: string;
    designation: string;
    // Job grade / band. Optional free text; captured on the record and shown
    // in the employee table.
    grade?: string;
    // Optional legacy biometric-device slot (whole number). Leave undefined
    // when the employee has no paired device — the employee code identifies
    // them everywhere else.
    deviceEnrollNo?: string;
    basicSalary: string;
    allowances?: string;
    deductions?: string;
    departmentId?: string;
    joiningDate: string;
    status: string;
    // Optional: a top-level / founder employee has nobody to report to.
    reportingManagerId?: number;
    // Optional login credentials — when both are given the new employee gets
    // a linked user account so they can sign in.
    email?: string;
    password?: string;
    // Leave types to configure for the new employee (ids from the leave-type
    // list). Seeds a balance row per type so the dashboard / apply-leave
    // screens immediately show only their types.
    leaveTypes?: string[];
  }): Promise<Employee> {
    const { data } = await api.post('/employees', payload);
    return data;
  },

  /**
   * Create a privileged account (HR Admin or Employee) via /admin-users.
   * This is the provisioning path that also links the login account; the
   * plain /employees path is used for Employee records without the extra
   * account-level rules.
   */
  async createAdminAccount(payload: {
    name: string;
    email: string;
    password?: string;
    role: 'HR_ADMIN' | 'EMPLOYEE';
    employeeCode: string;
    designation?: string;
    grade?: string;
    reportingManager?: string;
    joiningDate?: string;
    leaveTypes?: string[];
  }): Promise<{ id: string; name: string; email: string; role: string; employeeCode: string; }> {
    const { data } = await api.post('/admin-users', payload);
    return data;
  },

  /**
   * Reset a user account's password. The Super Admin may reset any account
   * (including HR Admins and their own); an HR Admin is limited to Employees.
   * The server revokes all of the target's live sessions, so the old password
   * stops working immediately.
   */
  async resetAdminPassword(id: string, password: string): Promise<{ id: string; message: string }> {
    const { data } = await api.post(`/admin-users/${id}/reset-password`, { password });
    return data;
  },

  /**
   * Delete an account and its linked employee record — the cleanup path for
   * stale entries (orphaned logins that appear in Accounts but have no
   * reachable employee record).
   */
  async deleteAdminAccount(id: string): Promise<{ id: string; message: string; email: string }> {
    const { data } = await api.delete(`/admin-users/${id}`);
    return data;
  },

  async updateEmployee(id: string, payload: {
    employeeCode?: string;
    firstName?: string;
    lastName?: string;
    designation?: string;
    grade?: string | null;
    departmentId?: string;
    joiningDate?: string;
    basicSalary?: string;
    allowances?: string;
    deductions?: string;
    status?: string;
    reportingManagerId?: number | null;
    leaveTypes?: string[];
  }): Promise<Employee> {
    const { data } = await api.patch(`/employees/${id}`, payload);
    return data;
  },

  async deactivateEmployee(id: string): Promise<{ id: string; status: string }> {
    const { data } = await api.post(`/employees/${id}/deactivate`);
    return data;
  },

  async activateEmployee(id: string): Promise<{ id: string; status: string }> {
    const { data } = await api.post(`/employees/${id}/activate`);
    return data;
  },

  // ---- Payout Details ----

  async getPayout(employeeId: string): Promise<PayoutDetail | null> {
    const { data } = await api.get<PayoutDetail | null>(`/employees/${employeeId}/payout`);
    return data;
  },

  /**
   * Save the payout structure. HR must type the employee's code into
   * `confirmedEmployeeCode` — the server blocks the write when it doesn't
   * match, so a wrong/empty confirmation changes nothing in the DB.
   */
  async updatePayout(
    employeeId: string,
    payload: {
      earnings: PayoutLine[];
      deductions: PayoutLine[];
      bankName?: string;
      accountNumber?: string;
      confirmedEmployeeCode: string;
    },
  ): Promise<PayoutDetail> {
    const { data } = await api.put<PayoutDetail>(`/employees/${employeeId}/payout`, payload);
    return data;
  },

  async getPayoutHistory(employeeId: string, limit = 20): Promise<PayoutHistoryEntry[]> {
    const { data } = await api.get<PayoutHistoryEntry[]>(`/employees/${employeeId}/payout/history`, {
      params: { limit },
    });
    return data;
  },

  // ---- Personal Profile (HR-maintained: address, DOB, contacts) ----

  async getPersonalProfile(employeeId: string): Promise<PersonalProfileData> {
    const { data } = await api.get<PersonalProfileData | null>(`/employees/${employeeId}/personal-profile`);
    return (
      data || { address: '', dateOfBirth: '', emergencyContact: '', personalEmail: '', anniversaryDate: '' }
    );
  },

  async updatePersonalProfile(
    employeeId: string,
    payload: Partial<PersonalProfileData>,
  ): Promise<PersonalProfileData> {
    const { data } = await api.put<PersonalProfileData>(`/employees/${employeeId}/personal-profile`, payload);
    return data;
  },

  async getDepartments(): Promise<Department[]> {
    const { data } = await api.get('/departments');
    return data;
  },

  async getDepartment(id: string): Promise<Department> {
    const { data } = await api.get(`/departments/${id}`);
    return data;
  },

  async createDepartment(payload: { name: string; description?: string; isActive?: boolean }): Promise<Department> {
    const { data } = await api.post('/departments', payload);
    return data;
  },

  async updateDepartment(id: string, payload: Partial<Department>): Promise<Department> {
    const { data } = await api.patch(`/departments/${id}`, payload);
    return data;
  },

  async deleteDepartment(id: string): Promise<{ message: string }> {
    const { data } = await api.delete(`/departments/${id}`);
    return data;
  },

  async getDesignations(): Promise<Designation[]> {
    const { data } = await api.get('/designations');
    return data;
  },

  async getDesignation(id: string): Promise<Designation> {
    const { data } = await api.get(`/designations/${id}`);
    return data;
  },

  async createDesignation(payload: { name: string; description?: string; isActive?: boolean }): Promise<Designation> {
    const { data } = await api.post('/designations', payload);
    return data;
  },

  async updateDesignation(id: string, payload: Partial<Designation>): Promise<Designation> {
    const { data } = await api.patch(`/designations/${id}`, payload);
    return data;
  },

  async deleteDesignation(id: string): Promise<{ message: string }> {
    const { data } = await api.delete(`/designations/${id}`);
    return data;
  },
};
