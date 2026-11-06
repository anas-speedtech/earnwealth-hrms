const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const PAGE_SIZE = 20;

// Standard working window: in by 09:30, out at 18:30, lunch break after
// 13:45. Used to classify matrix cells (late start -> FHDL, early end ->
// SHDL) and to detect off-day (weekend/holiday) punch-ins that earn a
// comp-off credit.
const STANDARD_IN = '09:30';
const STANDARD_OUT = '18:30';

class AttendanceService {
  static canAccessAll(reqUser) {
    return [Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role);
  }

  static getPrisma() {
    const { PrismaClient } = require('@prisma/client');
    if (!this._prisma) {
      this._prisma = new PrismaClient();
    }
    return this._prisma;
  }

  static resetPrisma() {
    this._prisma = null;
  }

  static formatIstDate(value) {
    return new Date(new Date(value).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  }

  /**
   * Month matrix: one row per employee, and for each day of the month the
   * earliest punch-in and latest punch-out times plus a status. This is the
   * data the Calendar view renders (Emp Code, Emp Name, 1..31 columns).
   */
  static async getMatrix(reqUser, { year, month }) {
    if (!this.canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view the attendance matrix.', 403);
    }

    const prisma = this.getPrisma();
    const yearNum = Number(year);
    const monthNum = Number(month);
    if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'A valid year and month are required.', 400);
    }

    const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
    const monthStart = new Date(Date.UTC(yearNum, monthNum - 1, 1) - IST_OFFSET_MS);
    const monthEnd = new Date(Date.UTC(yearNum, monthNum, 1) - IST_OFFSET_MS - 1);

    const employees = await prisma.$queryRawUnsafe(
      'SELECT id, employeeCode, name FROM employees WHERE isActive = 1 ORDER BY employeeCode ASC'
    );

    // All punch events in the month for active employees, in one query.
    const logs = await prisma.$queryRawUnsafe(
      `SELECT employeeId, punchTime, status FROM attendance_logs
       WHERE punchTime >= ? AND punchTime <= ? AND status IN ('IN','OUT')
       ORDER BY punchTime ASC`,
      monthStart,
      monthEnd
    );

    // Approved leaves overlapping the month — a leave day overrides punch
    // data in the cell (matches the reference report where leave days show
    // as solid red "Leave" cells). startDate/endDate are stored as the IST
    // wall-clock dates the user chose, so compare against the IST dates of
    // the month window.
    const istMonthStart = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0) + IST_OFFSET_MS);
    const istMonthEnd = new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0) + IST_OFFSET_MS - 1);
    const leaves = await prisma.$queryRawUnsafe(
      `SELECT employeeId, startDate, endDate, status FROM leaves
       WHERE status = 'APPROVED' AND endDate >= ? AND startDate <= ?
       ORDER BY startDate ASC`,
      istMonthStart,
      istMonthEnd
    );

    // Holidays listed in the month (off-day detection for comp-off
    // eligibility). Matched by IST date key.
    const holidays = await prisma.$queryRawUnsafe(
      `SELECT date FROM holidays WHERE date >= ? AND date < ?`,
      new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0)),
      new Date(Date.UTC(yearNum, monthNum, 1, 0, 0, 0))
    );
    const holidaySet = new Set(
      holidays.map((h) => {
        const istDate = new Date(new Date(h.date).getTime() + IST_OFFSET_MS);
        return `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${String(istDate.getUTCDate()).padStart(2, '0')}`;
      })
    );

    // employeeId -> Set of day numbers on approved leave.
    const leaveDays = new Map();
    for (const row of leaves) {
      const empKey = String(row.employeeId);
      // Dates come back as UTC-midnight Dates; convert to the IST wall-clock
      // day numbers (same treatment as the punch times above).
      const start = new Date(new Date(row.startDate).getTime() + IST_OFFSET_MS);
      const end = new Date(new Date(row.endDate).getTime() + IST_OFFSET_MS);
      if (start.getUTCFullYear() !== yearNum || (start.getUTCMonth() + 1) !== monthNum) continue;
      if (!leaveDays.has(empKey)) leaveDays.set(empKey, new Set());
      const set = leaveDays.get(empKey);
      for (let d = start.getUTCDate(); d <= Math.min(end.getUTCDate(), daysInMonth); d++) {
        set.add(d);
      }
    }

    // employeeId -> day -> { firstIn, lastOut }
    const byEmpDay = new Map();
    for (const log of logs) {
      const empId = String(log.employeeId);
      const istDate = new Date(new Date(log.punchTime).getTime() + IST_OFFSET_MS);
      const dayNum = istDate.getUTCDate();
      // Only keep days that belong to the requested month (IST boundary).
      if (istDate.getUTCFullYear() !== yearNum || (istDate.getUTCMonth() + 1) !== monthNum) continue;
      if (!byEmpDay.has(empId)) byEmpDay.set(empId, new Map());
      const dayMap = byEmpDay.get(empId);
      let cell = dayMap.get(dayNum);
      if (!cell) {
        cell = { firstIn: null, lastOut: null };
        dayMap.set(dayNum, cell);
      }
      // Format the punch time as a plain HH:MM string. `punchTime` comes back
      // as a JS Date from the DATETIME column, so convert to the IST wall-clock
      // time and take the hour/minute components.
      const istWall = new Date(log.punchTime.getTime() + IST_OFFSET_MS);
      const hh = String(istWall.getUTCHours()).padStart(2, '0');
      const mm = String(istWall.getUTCMinutes()).padStart(2, '0');
      const timeStr = hh + ':' + mm;
      if (String(log.status).toUpperCase() === 'IN') {
        if (!cell.firstIn || timeStr < cell.firstIn) cell.firstIn = timeStr;
      } else if (cell.lastOut === null || timeStr > cell.lastOut) {
        cell.lastOut = timeStr;
      }
    }

    // Off-day flags per calendar day: weekends (Sat/Sun) and listed
    // holidays. A punch-in on an off day earns the employee a comp-off
    // credit (valid 3 months, per the comp-off policy).
    const istDateOf = (d) => new Date(Date.UTC(yearNum, monthNum - 1, d) + IST_OFFSET_MS);
    const offDays = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      const istDate = istDateOf(d);
      const weekday = istDate.getUTCDay(); // 0=Sun, 6=Sat
      const dateKey = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (weekday === 0 || weekday === 6 || holidaySet.has(dateKey)) offDays.add(d);
    }

    const rows = employees.map((emp) => {
      const dayMap = byEmpDay.get(String(emp.id));
      const empLeaveDays = leaveDays.get(String(emp.id));
      const days = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = dayMap?.get(d);
        const firstIn = cell?.firstIn || null;
        const lastOut = cell?.lastOut || null;
        const hasIn = !!firstIn;
        const hasOut = !!lastOut;
        const onLeave = empLeaveDays?.has(d);
        const isOffDay = offDays.has(d);

        // Classification follows the standard 09:30–18:30 window:
        //  - a first punch-in after 09:30 -> FHDL (First Half Day Leave)
        //  - a last punch-out before 18:30 -> SHDL (Second Half Day Leave)
        //  - both sides on time -> P (full day)
        //  - only one side captured, or a mid-day start after the 13:45
        //    lunch break -> HDL (generic half day)
        const lateIn = hasIn && firstIn > STANDARD_IN;
        const earlyOut = hasOut && lastOut < STANDARD_OUT;
        const tags = [];
        if (lateIn) tags.push('FHDL');
        if (earlyOut) tags.push('SHDL');
        // No data at all on an off day is expected — not a gap.
        let status = '—';
        let halfDay = false;
        if (onLeave) {
          status = 'L';
        } else if (hasIn || hasOut) {
          if (lateIn || earlyOut || (!hasIn || !hasOut)) {
            status = 'H';
            halfDay = true;
            if (!lateIn && !earlyOut) tags.push('HDL');
          } else {
            status = 'P';
          }
        }
        // Punched in on a weekend/holiday -> comp-off eligible (3-month
        // validity matches comp_off_policy.expiryMonths).
        const compOffEligible = isOffDay && hasIn && !onLeave;

        days.push({
          day: d,
          in: firstIn,
          out: lastOut,
          status,
          onLeave,
          halfDay,
          halfDayTags: tags,
          isOffDay,
          compOffEligible,
          hasPunch: hasIn || hasOut,
        });
      }
      return {
        employeeId: String(emp.id),
        employeeCode: emp.employeeCode,
        name: emp.name,
        days,
      };
    });

    return {
      year: yearNum,
      month: monthNum,
      daysInMonth,
      rows,
    };
  }

  static istDayRange(value, endOfDay = false) {
    const parts = String(value || '').split('-').map((part) => Number(part));
    if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
      return null;
    }
    const [year, month, day] = parts;
    const utcStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - IST_OFFSET_MS);
    const utcEnd = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0) - IST_OFFSET_MS - 1);
    return endOfDay ? utcEnd : utcStart;
  }

  static async resolveTargetEmployee(reqUser, targetEmployeeId) {
    if (!targetEmployeeId) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Employee ID is required.', 400);
    }

    const prismaClient = this.getPrisma();

    let rows = [];

    if (String(targetEmployeeId) === String(reqUser.id)) {
      rows = await prismaClient.$queryRawUnsafe(
        'SELECT id, userId, isActive FROM employees WHERE userId = ? LIMIT 1',
        Number(reqUser.id)
      );
    } else {
      rows = await prismaClient.$queryRawUnsafe(
        'SELECT id, userId, isActive FROM employees WHERE id = ? LIMIT 1',
        targetEmployeeId
      );

      if (!rows?.length) {
        throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
      }

      if (
        !this.canAccessAll(reqUser) &&
        String(rows[0].userId) !== String(reqUser.id)
      ) {
        throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only access your own attendance records.', 403);
      }
    }

    if (!rows || !rows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    if (!rows[0].isActive) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Cannot access attendance for an inactive employee.', 400);
    }

    return String(rows[0].id);
  }

  static async getLastPunch(employeeId) {
    const prismaClient = this.getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      "SELECT id, punchTime, status FROM attendance_logs WHERE employeeId = ? ORDER BY punchTime DESC, id DESC LIMIT 1",
      employeeId
    );
    return rows && rows.length ? rows[0] : null;
  }

  static async getEmployeeIsActive(employeeId) {
    const prismaClient = this.getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT isActive FROM employees WHERE id = ? LIMIT 1',
      employeeId
    );
    return rows && rows.length && Number(rows[0].isActive) === 1;
  }

  static async punchIn(reqUser, { employeeId, workMode }) {
    const mode = (workMode || 'OFFICE').toUpperCase();
    if (!['OFFICE', 'WFH'].includes(mode)) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Invalid work mode. Use OFFICE or WFH.', 400);
    }

    const targetEmployeeId = await this.resolveTargetEmployee(reqUser, employeeId);
    const prismaClient = this.getPrisma();

    if (!(await this.getEmployeeIsActive(targetEmployeeId))) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    const lastPunch = await this.getLastPunch(targetEmployeeId);
    if (lastPunch && String(lastPunch.status).toUpperCase() === 'IN') {
      throw new AppError(AppErrorCodes.ATTENDANCE_ALREADY_PUNCHED, 'You already have an active session. Please punch out first.', 409);
    }

    await prismaClient.$executeRawUnsafe(
      "INSERT INTO attendance_logs (employeeId, punchTime, status, source, importBatchId, createdAt) VALUES (?, NOW(), 'IN', 'MANUAL', NULL, NOW(3))",
      targetEmployeeId
    );

    const inserted = await prismaClient.$queryRawUnsafe(
      "SELECT id, punchTime FROM attendance_logs WHERE employeeId = ? AND status = 'IN' ORDER BY punchTime DESC, id DESC LIMIT 1",
      targetEmployeeId
    );

    const session = inserted && inserted[0];
    if (!session) {
      throw new AppError(AppErrorCodes.INTERNAL_ERROR, 'Punch in failed.', 500);
    }

    logger.info('Punch in recorded', { employeeId: targetEmployeeId, sessionId: session.id });
    return {
      id: String(session.id),
      attendanceId: String(session.id),
      punchIn: session.punchTime,
      punchOut: null,
      durationMinutes: 0,
      workMode: mode,
      date: this.formatIstDate(session.punchTime),
    };
  }

  static async punchOut(reqUser, { employeeId }) {
    const targetEmployeeId = await this.resolveTargetEmployee(reqUser, employeeId);
    const prismaClient = this.getPrisma();

    const lastPunch = await this.getLastPunch(targetEmployeeId);
    if (!lastPunch || String(lastPunch.status).toUpperCase() !== 'IN') {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'No active session to punch out from.', 400);
    }

    // Event time comes only from MySQL, rather than mixing SQL NOW() with a
    // Node clock. This keeps elapsed-time checks consistent with inserts.
    const elapsedRows = await prismaClient.$queryRawUnsafe(
      'SELECT TIMESTAMPDIFF(SECOND, ?, NOW()) AS elapsedSeconds',
      lastPunch.punchTime
    );
    const elapsedSeconds = Number(elapsedRows && elapsedRows.length ? elapsedRows[0].elapsedSeconds : NaN);
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Punch-out time must be after punch-in time.', 400);
    }

    await prismaClient.$executeRawUnsafe(
      "INSERT INTO attendance_logs (employeeId, punchTime, status, source, importBatchId, createdAt) VALUES (?, NOW(), 'OUT', 'MANUAL', NULL, NOW(3))",
      targetEmployeeId
    );

    const inserted = await prismaClient.$queryRawUnsafe(
      "SELECT id, punchTime FROM attendance_logs WHERE employeeId = ? AND status = 'OUT' ORDER BY punchTime DESC, id DESC LIMIT 1",
      targetEmployeeId
    );

    const durationMinutes = Math.round(elapsedSeconds / 60);
    const session = inserted && inserted[0];

    if (!session) {
      throw new AppError(AppErrorCodes.INTERNAL_ERROR, 'Punch-out record was not created.', 500);
    }

    logger.info('Punch out recorded', { employeeId: targetEmployeeId, sessionId: session.id });
    return {
      id: String(session.id),
      punchOut: session.punchTime,
      durationMinutes,
    };
  }

  static async getOpenSession(reqUser) {
    const prismaClient = this.getPrisma();
    let employeeId = null;

    try {
      employeeId = await this.resolveTargetEmployee(reqUser, reqUser.id);
    } catch (err) {
      return null;
    }

    const lastPunch = await this.getLastPunch(employeeId);
    if (!lastPunch || String(lastPunch.status).toUpperCase() !== 'IN') {
      return null;
    }

    return {
      id: String(lastPunch.id),
      punchIn: lastPunch.punchTime,
      workMode: 'OFFICE',
    };
  }

  static buildHistoryFromLogs(rows) {
    const grouped = new Map();
    for (const row of rows) {
      const dateKey = this.formatIstDate(row.punchTime);
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey).push(row);
    }

    const records = Array.from(grouped.entries()).map(([date, events]) => {
      const sessions = [];
      let currentIn = null;
      let totalMinutes = 0;

      for (const event of events) {
        if (String(event.status).toUpperCase() === 'IN') {
          if (currentIn) {
            sessions.push({ id: String(currentIn.id), punchIn: currentIn.punchTime, punchOut: null, durationMinutes: 0 });
          }
          currentIn = event;
        } else if (String(event.status).toUpperCase() === 'OUT' && currentIn) {
          const minutes = Math.max(0, Math.round((new Date(event.punchTime).getTime() - new Date(currentIn.punchTime).getTime()) / 60000));
          sessions.push({ id: String(currentIn.id), punchIn: currentIn.punchTime, punchOut: event.punchTime, durationMinutes: minutes });
          totalMinutes += minutes;
          currentIn = null;
        }
      }

      if (currentIn) {
        sessions.push({ id: String(currentIn.id), punchIn: currentIn.punchTime, punchOut: null, durationMinutes: 0 });
      }

      return {
        id: date,
        date: new Date(`${date}T00:00:00+05:30`).toISOString(),
        workMode: 'OFFICE',
        status: totalMinutes > 0 && totalMinutes < 240 ? 'PARTIAL' : (sessions.length ? 'PRESENT' : 'PRESENT'),
        totalMinutes,
        sessions,
        corrected: false,
      };
    });

    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return records;
  }

  static async getHistory(reqUser, targetEmployeeId, { page = 1, startDate, endDate }) {
    const employeeId = await this.resolveTargetEmployee(reqUser, targetEmployeeId);
    const prismaClient = this.getPrisma();

    const conditions = ['employeeId = ?'];
    const params = [employeeId];
    if (startDate) {
      const start = this.istDayRange(startDate);
      if (!start) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid start date.', 400);
      conditions.push('punchTime >= ?');
      params.push(start);
    }
    if (endDate) {
      const end = this.istDayRange(endDate, true);
      if (!end) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid end date.', 400);
      conditions.push('punchTime <= ?');
      params.push(end);
    }

    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, punchTime, status FROM attendance_logs WHERE ' + conditions.join(' AND ') + ' ORDER BY punchTime ASC, id ASC',
      ...params
    );

    const records = this.buildHistoryFromLogs(rows || []);
    const safePage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    const total = records.length;
    const startOffset = (safePage - 1) * PAGE_SIZE;
    const paged = records.slice(startOffset, startOffset + PAGE_SIZE);
    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      records: paged,
      pagination: { page: safePage, pageSize: PAGE_SIZE, total, pages },
    };
  }

  static async getSummary(reqUser, targetEmployeeId, { startDate, endDate }) {
    const employeeId = await this.resolveTargetEmployee(reqUser, targetEmployeeId);
    const prismaClient = this.getPrisma();

    const conditions = ['employeeId = ?'];
    const params = [employeeId];
    if (startDate) {
      const start = this.istDayRange(startDate);
      if (!start) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid start date.', 400);
      conditions.push('punchTime >= ?');
      params.push(start);
    }
    if (endDate) {
      const end = this.istDayRange(endDate, true);
      if (!end) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid end date.', 400);
      conditions.push('punchTime <= ?');
      params.push(end);
    }

    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT id, punchTime, status FROM attendance_logs WHERE ' + conditions.join(' AND ') + ' ORDER BY punchTime ASC, id ASC',
      ...params
    );

    const records = this.buildHistoryFromLogs(rows || []);
    const totalMinutes = records.reduce((sum, record) => sum + (record.totalMinutes || 0), 0);
    const totalDays = records.length;
    const totalSessions = records.reduce((sum, record) => sum + record.sessions.length, 0);
    return {
      totalDays,
      totalPresent: records.filter((record) => record.status === 'PRESENT').length,
      totalPartial: records.filter((record) => record.status === 'PARTIAL').length,
      totalMinutes,
      totalSessions,
      avgMinutesPerDay: totalDays > 0 ? Math.round(totalMinutes / totalDays) : 0,
    };
  }
}

module.exports = { AttendanceService };
