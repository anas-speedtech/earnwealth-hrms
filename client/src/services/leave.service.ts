import api from './api';

export interface LeaveTypeItem {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  code: string;
  classification: string;
  isHalfDayAllowed: boolean;
  policy: {
    id: string;
    annualEntitlementDays: number;
    accrualFrequency: string;
    carryForwardEnabled: boolean;
    maxConsecutiveDays: number | null;
    minDaysBeforeApply: number;
  } | null;
}

export interface LeaveBalanceItem {
  id: string;
  leaveTypeId: string;
  name: string;
  displayName: string;
  code: string;
  classification: string;
  openingBalance: number;
  accruedBalance: number;
  usedBalance: number;
  reservedBalance: number;
  availableBalance: number;
  // Legacy aliases for compatibility
  leaveTypeName?: string;
  leaveTypeCode?: string;
}

export interface LeaveRequestItem {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  type?: string;
  employeeName?: string;
  employeeCode?: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  halfDayPeriod: string | null;
  totalDays: number;
  reason: string;
  status: string;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export const leaveService = {
  // Employee: Get my balances
  async getMyBalances(): Promise<LeaveBalanceItem[]> {
    const { data } = await api.get<LeaveBalanceItem[]>('/leaves/balance');
    return data;
  },

  // Employee: Get my requests
  async getMyRequests(page = 1, status?: string): Promise<{ requests: LeaveRequestItem[]; pagination: Record<string, unknown> }> {
    const { data } = await api.get('/leaves/my-requests', { params: { page, ...(status ? { status } : {}) } });
    return data;
  },

  // Employee: Submit leave request
  async createRequest(payload: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    isHalfDay?: boolean;
    halfDayPeriod?: 'FIRST_HALF' | 'SECOND_HALF' | null;
    reason: string;
  }): Promise<LeaveRequestItem> {
    const { data } = await api.post<LeaveRequestItem>('/leaves', payload);
    return data;
  },

  // Employee: Cancel leave request
  async cancelRequest(requestId: string): Promise<{ id: string; status: string }> {
    const { data } = await api.post<{ id: string; status: string }>(`/leaves/${requestId}/cancel`);
    return data;
  },

  // Employee: Get request detail
  async getRequestDetail(requestId: string): Promise<LeaveRequestItem> {
    const { data } = await api.get<LeaveRequestItem>(`/leaves/${requestId}`);
    return data;
  },

  // Any authenticated: Get active leave types for application
  async getActiveLeaveTypes(): Promise<LeaveTypeItem[]> {
    const { data } = await api.get<LeaveTypeItem[]>('/leaves/types');
    return data;
  },

  // HR/Admin/SuperAdmin: Get pending leave requests
  async getPendingRequests(): Promise<LeaveRequestItem[]> {
    const { data } = await api.get<LeaveRequestItem[]>('/leaves/pending');
    return data;
  },

  // HR/Admin/SuperAdmin: Get all leave requests
  async getAllRequests(params?: { page?: number; status?: string; employeeId?: string }): Promise<{ requests: LeaveRequestItem[]; pagination: Record<string, unknown> }> {
    const { data } = await api.get('/leaves/all', { params });
    return data;
  },

  // HR/Admin/SuperAdmin: Get employee balances
  async getEmployeeBalances(employeeId: string): Promise<LeaveBalanceItem[]> {
    const { data } = await api.get<LeaveBalanceItem[]>(`/leaves/employee/${employeeId}/balances`);
    return data;
  },

  // HR/Admin/SuperAdmin: Approve leave request
  async approveRequest(requestId: string, reviewComment = ''): Promise<{ id: string; status: string }> {
    const { data } = await api.post<{ id: string; status: string }>(`/leaves/${requestId}/approve`, { reviewComment });
    return data;
  },

  // HR/Admin/SuperAdmin: Reject leave request
  async rejectRequest(requestId: string, reviewComment: string): Promise<{ id: string; status: string }> {
    const { data } = await api.post<{ id: string; status: string }>(`/leaves/${requestId}/reject`, { reviewComment });
    return data;
  },

  // Admin/HR/SuperAdmin: List all leave types
  async getAllLeaveTypes(): Promise<LeaveTypeItem[]> {
    const { data } = await api.get<LeaveTypeItem[]>('/leave-types');
    return data;
  },

  // Admin/HR/SuperAdmin: Create leave type
  async createLeaveType(payload: Record<string, unknown>): Promise<{ id: string; name: string; displayName: string; code: string }> {
    const { data } = await api.post('/leave-types', payload);
    return data;
  },

  // Admin/HR/SuperAdmin: Update leave type
  async updateLeaveType(id: string, payload: Record<string, unknown>): Promise<{ id: string; displayName: string }> {
    const { data } = await api.put(`/leave-types/${id}`, payload);
    return data;
  },

  // Admin/HR/SuperAdmin: Delete leave type (SuperAdmin only)
  async deleteLeaveType(id: string): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/leave-types/${id}`);
    return data;
  },

  // Initialize balances for an employee
  async initializeBalances(employeeId: string): Promise<Record<string, unknown>> {
    const { data } = await api.post(`/leaves/employee/${employeeId}/initialize`);
    return data;
  },

  // Process monthly accrual
  async processMonthlyAccrual(): Promise<Record<string, unknown>> {
    const { data } = await api.post('/leaves/accrual/monthly');
    return data;
  },
};
