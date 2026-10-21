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

export interface ImportSkipRow {
  line: string;
  reason: string;
}

export interface ImportResult {
  importId: number;
  matched: number;
  duplicates: number;
  skipped: ImportSkipRow[];
  unmatched: string[];
}

export interface AttendanceImport {
  id: number;
  fileName: string | null;
  importedBy: number;
  totalRows: number;
  savedRows: number;
  duplicateRows: number;
  failedRows: number;
  unknownCodes: string[];
  importedAt: string;
}

export const attendanceService = {
  async punchIn(payload: PunchInPayload) {
    const { data } = await api.post('/attendance/punch-in', payload);
    return data;
  },

  /**
   * Uploads a biometric .dat export. The raw file is sent as multipart so the
   * server can parse it row by row and match each punch to an employee code.
   */
  async importDat(file: File, note?: string): Promise<ImportResult> {
    const form = new FormData();
    form.append('file', file);
    if (note) form.append('note', note);
    const { data } = await api.post('/attendance/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async listImports(): Promise<AttendanceImport[]> {
    const { data } = await api.get<{ imports: AttendanceImport[] }>('/attendance/imports');
    return data.imports;
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
