import api from './api';

export interface CorrectionRequest {
  id: string;
  attendanceId: string;
  date: string;
  reason: string;
  status: string;
  employeeName?: string;
  employeeCode?: string;
  employeeEmail?: string;
  reviewComment?: string;
  createdAt: string;
}

export interface CorrectionListResponse {
  corrections: CorrectionRequest[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

export interface CreateCorrectionPayload {
  attendanceId: string;
  correctedPunchIn?: string;
  correctedPunchOut?: string;
  correctedStatus?: string;
  reason: string;
}

export const correctionService = {
  async listMy(page = 1) {
    const { data } = await api.get('/attendance/corrections/my', {
      params: { page },
    });
    return data as CorrectionListResponse;
  },

  async create(payload: CreateCorrectionPayload) {
    const { data } = await api.post('/attendance/corrections', payload);
    return data;
  },

  async listPending() {
    const { data } = await api.get('/attendance/corrections/pending');
    return data.corrections as CorrectionRequest[];
  },

  async approve(id: string, reviewComment?: string) {
    const { data } = await api.post(`/attendance/corrections/${id}/approve`, { reviewComment });
    return data;
  },

  async reject(id: string, reviewComment?: string) {
    const { data } = await api.post(`/attendance/corrections/${id}/reject`, { reviewComment });
    return data;
  },
};
