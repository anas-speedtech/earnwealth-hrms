import api from './api';

// Client service for the Comp-Off module (see server/src/routes/compoff.js).
// Every call uses the shared axios instance, so the baseURL already ends with
// `/api` and the paths below must not repeat that prefix. The Comp-Off routes
// return their payload directly (there is no `{ data: ... }` wrapper), unlike
// the payroll routes.

export interface CompOffPolicy {
  expiryMonths: number;
  minWorkingMinutes: number;
  maxDaysPerMonth: number;
  isActive: boolean;
}

export interface CompOffBalance {
  totalEarned: number;
  totalUsed: number;
  totalAdjusted: number;
  available: number;
}

export interface EligibleDate {
  date: string;
  eligible: boolean;
}

export interface CompOffCreditItem {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  sourceDate: string;
  earnedDays: number;
  usedDays: number;
  remaining: number;
  status: string;
  expiresAt: string | null;
  reason: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface CompOffCreditsPage {
  credits: CompOffCreditItem[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}

export interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  employeeName: string;
  createdAt: string;
}

export interface CompOffLedgerPage {
  ledger: LedgerEntry[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}

export interface CompOffLeaveRequest {
  id: number;
  employeeName?: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  totalDays: number;
  reason: string;
  status: string;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CompOffLeavesPage {
  requests: CompOffLeaveRequest[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}

export interface CompOffReviewResult {
  id: string;
  status: string;
}

export interface CompOffActionResult {
  processed: number;
}

export interface CompOffPolicyUpdate {
  creditExpiryMonths?: number;
  minWorkingMinutes?: number;
  maxDaysPerMonth?: number;
}

export const compoffService = {
  // ---- Policy (visible to every authenticated user) ----

  async getPolicy(): Promise<CompOffPolicy> {
    const { data } = await api.get('/compoff/policy');
    return data;
  },

  async updatePolicy(payload: CompOffPolicyUpdate): Promise<CompOffPolicy> {
    const { data } = await api.put('/compoff/policy', payload);
    return data;
  },

  // ---- Employee: my balance and eligibility ----

  async getMyBalance(): Promise<{
    totalEarned: number;
    totalUsed: number;
    totalAdjusted: number;
    available: number;
  }> {
    const { data } = await api.get('/compoff/balance');
    return data;
  },

  async getEligibleDates(month?: number, year?: number): Promise<EligibleDate[]> {
    const { data } = await api.get('/compoff/eligible-dates', {
      params: { month, year },
    });
    return data;
  },

  // ---- Employee: my credits ----

  async getMyCredits(page = 1): Promise<CompOffCreditsPage> {
    const { data } = await api.get('/compoff/my-credits', {
      params: { page },
    });
    return data;
  },

  async getMyLedger(page = 1): Promise<CompOffLedgerPage> {
    const { data } = await api.get('/compoff/ledger', {
      params: { page },
    });
    return data;
  },

  // ---- Employee: request a credit and redeem it ----

  async requestCredit(sourceDate: string): Promise<unknown> {
    const { data } = await api.post('/compoff/request-credit', { sourceDate });
    return data;
  },

  async applyLeave(payload: {
    startDate: string;
    endDate: string;
    isHalfDay?: boolean;
    halfDayPeriod?: 'FIRST_HALF' | 'SECOND_HALF';
    reason?: string;
  }): Promise<unknown> {
    const { data } = await api.post('/compoff/apply-leave', payload);
    return data;
  },

  async listMyLeaveRequests(status?: string): Promise<CompOffLeavesPage> {
    const { data } = await api.get('/compoff/my-leaves', {
      params: { status },
    });
    return data;
  },

  // ---- HR: review queues and process ----

  async listPendingCredits(): Promise<CompOffCreditItem[]> {
    const { data } = await api.get('/compoff/pending');
    return data;
  },

  async reviewCredit(creditId: number, action: 'APPROVE' | 'REJECT', reason?: string): Promise<CompOffReviewResult> {
    const { data } = await api.post(`/compoff/credits/${creditId}/review`, {
      action,
      reason,
    });
    return data;
  },

  async listPendingCompOffLeaves(): Promise<CompOffLeaveRequest[]> {
    const { data } = await api.get('/compoff/leaves/pending');
    return data;
  },

  async reviewCompOffLeave(
    leaveId: number,
    action: 'APPROVE' | 'REJECT',
    reviewComment?: string,
  ): Promise<CompOffReviewResult> {
    const { data } = await api.post(`/compoff/leaves/${leaveId}/review`, {
      action,
      reviewComment,
    });
    return data;
  },

  async listAllCredits(page = 1): Promise<CompOffCreditsPage> {
    const { data } = await api.get('/compoff/credits', {
      params: { page },
    });
    return data;
  },

  async processExpiredCredits(): Promise<CompOffActionResult> {
    const { data } = await api.post('/compoff/process-expiry', {});
    return data;
  },
};
