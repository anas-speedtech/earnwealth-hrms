import api from './api';

export interface PunchInPayload {
  employeeId: string;
  workMode: 'OFFICE' | 'WFH';
}

export interface PunchOutPayload {
  employeeId: string;
}

export interface WorkSession {
  id: string;
  punchIn: string;
  punchOut: string | null;
  durationMinutes: number;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  workMode: string;
  status: string;
  totalMinutes: number;
  sessions: WorkSession[];
  corrected: boolean;
}

export interface AttendanceHistory {
  records: AttendanceRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

export interface AttendanceSummary {
  totalDays: number;
  totalPresent: number;
  totalPartial: number;
  totalMinutes: number;
  totalSessions: number;
  avgMinutesPerDay: number;
}

export interface OpenSession {
  id: string;
  punchIn: string;
  workMode: string;
}

export const attendanceService = {
  async punchIn(payload: PunchInPayload) {
    const { data } = await api.post('/attendance/punch-in', payload);
    return data;
  },

  async punchOut(payload: PunchOutPayload) {
    const { data } = await api.post('/attendance/punch-out', payload);
    return data;
  },

  async getOpenSession() {
    const { data } = await api.get('/attendance/open-session');
    return data.session;
  },

  async getMyHistory(page = 1, startDate?: string, endDate?: string): Promise<AttendanceHistory> {
    const { data } = await api.get('/attendance/my-history', {
      params: { page, startDate, endDate },
    });
    return data;
  },

  async getEmployeeHistory(
    employeeId: string,
    page = 1,
    startDate?: string,
    endDate?: string,
  ): Promise<AttendanceHistory> {
    const { data } = await api.get(`/attendance/employees/${employeeId}/history`, {
      params: { page, startDate, endDate },
    });
    return data;
  },

  async getEmployeeSummary(employeeId: string, startDate?: string, endDate?: string) {
    const { data } = await api.get(`/attendance/employees/${employeeId}/summary`, {
      params: { startDate, endDate },
    });
    return data as AttendanceSummary;
  },
};
