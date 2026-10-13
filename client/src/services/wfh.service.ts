import api from './api';

export interface WFHRequest {
  id: string;
  requestDate: string;
  reason: string;
  status: string;
  reviewComment?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface WFHListResponse {
  requests: WFHRequest[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

export interface PendingWFHRequest extends WFHRequest {
  employeeName: string;
  employeeCode: string;
  employeeEmail: string;
}

export const wfhService = {
  async create(requestDate: string, reason: string) {
    const { data } = await api.post('/wfh/requests', { requestDate, reason });
    return data;
  },

  async listMy(page = 1) {
    const { data } = await api.get('/wfh/my-requests', {
      params: { page },
    });
    return data as WFHListResponse;
  },

  async cancel(requestId: string) {
    const { data } = await api.post(`/wfh/requests/${requestId}/cancel`);
    return data;
  },

  async listPending() {
    const { data } = await api.get('/wfh/requests/pending');
    return data.requests as PendingWFHRequest[];
  },

  async listAll(page = 1, status?: string) {
    const { data } = await api.get('/wfh/requests', {
      params: { page, status },
    });
    return data as WFHListResponse;
  },

  async approve(requestId: string, reviewComment?: string) {
    const { data } = await api.post(`/wfh/requests/${requestId}/approve`, { reviewComment });
    return data;
  },

  async reject(requestId: string, reviewComment?: string) {
    const { data } = await api.post(`/wfh/requests/${requestId}/reject`, { reviewComment });
    return data;
  },
};
