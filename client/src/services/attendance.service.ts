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

export interface MatrixDay {
  day: number;
  in: string | null;
  out: string | null;
  // 'L' = approved leave day, 'P' = full present (in by 09:30, out at/after
  // 18:30), 'H' = half day (FHDL / SHDL / incomplete), '—' = no data.
  status: 'P' | 'H' | 'L' | '—';
  onLeave: boolean;
  halfDay: boolean;
  // Half-day markers shown in the cell: 'FHDL' = first punch-in after 09:30
  // (first half missed), 'SHDL' = last punch-out before 18:30 (second half
  // missed), 'HDL' = generic half day (only one side captured).
  halfDayTags: string[];
  // Weekend or listed holiday.
  isOffDay: boolean;
  // Punched in on an off day -> eligible for a comp-off credit (valid 3
  // months).
  compOffEligible: boolean;
  hasPunch: boolean;
}

export interface MatrixRow {
  employeeId: string;
  employeeCode: string;
  name: string;
  days: MatrixDay[];
}

export interface AttendanceMatrix {
  year: number;
  month: number;
  daysInMonth: number;
  rows: MatrixRow[];
}

// Per-day metadata the self calendar uses to decide what a cell allows.
// Extended onto MatrixDay by the my-matrix endpoint.
export interface MyMatrixDay extends MatrixDay {
  isOffDay: boolean;
  isWeeklyOff: boolean;
  holidayName: string | null;
  /** A device (.dat) punch exists for the day — read-only. */
  locked: boolean;
  /** An approved WFH request covers this day. */
  wfh: boolean;
  /** The only case where the employee may enter a manual punch. */
  canSelfPunch: boolean;
}

export interface MyMatrix {
  year: number;
  month: number;
  daysInMonth: number;
  employee: { id: string; employeeCode: string; name: string };
  days: MyMatrixDay[];
}

export interface ApplyPunchResult {
  date: string;
  punchIn: string;
  punchOut: string | null;
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

  /**
   * Month matrix for the Calendar view: one row per active employee with the
   * in/out times for each day 1..N of the month.
   */
  async getMatrix(year: number, month: number): Promise<AttendanceMatrix> {
    const { data } = await api.get('/attendance/matrix', {
      params: { year, month },
    });
    return data;
  },

  /**
   * Self-only month matrix for the employee calendar: the same look as the HR
   * matrix but just the employee's own row, plus per-day flags (weekly off,
   * holiday, locked-by-device, self-punch-allowed).
   */
  async getMyMatrix(year: number, month: number): Promise<MyMatrix> {
    const { data } = await api.get('/attendance/my-matrix', {
      params: { year, month },
    });
    return data;
  },

  /**
   * Employee applies a manual punch pair for a specific calendar day (the
   * day-click flow). Only valid on approved-WFH days without device data.
   */
  async applyPunch(payload: { date: string; punchIn: string; punchOut?: string }): Promise<ApplyPunchResult> {
    const { data } = await api.post('/attendance/apply-punch', payload);
    return data;
  },
};
