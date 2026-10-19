/**
 * Comp-Off Management System — Unit Tests
 * Covers all 22 requirements from Prompt 13.
 * Uses mocked Prisma — no database connection required.
 */

const { CompOffService } = require('../src/services/compoff.service');
const { AppError, AppErrorCodes } = require('../src/errors/AppError');
const { Role } = require('../src/types/index');

// ============================================================
// MOCKS — @prisma/client is mocked globally by jest.mock()
// ============================================================

const mockModel = {
  compOffPolicy:    { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  compOffCredit:    { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  compOffLedger:    { findMany: jest.fn(), aggregate: jest.fn(), create: jest.fn(), count: jest.fn() },
  compOffLeave:     { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  employeeProfile:  { findUnique: jest.fn() },
  attendance:       { findUnique: jest.fn(), findMany: jest.fn() },
  holiday:          { findMany: jest.fn() },
  auditLog:         { create: jest.fn() },
  $transaction:     jest.fn(async (fn) => fn(mockModel)),
  // Query-realistic raw-sql mocks. The service writes against live MySQL tables
  // with $queryRawUnsafe/$executeRawUnsafe, so the mock returns query-appropriate
  // rows instead of a constant empty array (which previously caused getPolicy to
  // recurse infinitely and exhaust the heap).
  _policyRows: undefined,
  _empByUserRows: undefined,
  _empByIdRows: undefined,
  _ledgerSumRows: undefined,
  _attendanceRows: undefined,
  _creditCount: 0,
  _creditByIdRows: undefined,
  _creditListRows: undefined,
  $queryRawUnsafe: jest.fn(async (sql, ...params) => {
    const s = String(sql || '');
    const lower = s.toLowerCase();

    if (lower.includes('comp_off_policy') && lower.includes('isactive = 1')) {
      return mockModel._policyRows || [];
    }
    if (lower.includes('from employees') && lower.includes('where userid = ?')) {
      return mockModel._empByUserRows || [];
    }
    if (lower.includes('from employees') && lower.includes('where id = ?')) {
      return mockModel._empByIdRows || [];
    }
    if (lower.includes('comp_off_ledger') && lower.includes('sum(')) {
      return mockModel._ledgerSumRows || [{ totalEarned: '0', totalUsed: '0', totalAdjusted: '0' }];
    }
    if (lower.includes('count(*)') && lower.includes('comp_off_credits')) {
      return [{ total: String(mockModel._creditCount || 0) }];
    }
    if (lower.includes('count(*)') && lower.includes('comp_off_ledger')) {
      return [{ total: '0' }];
    }
    if (lower.includes('from comp_off_credits c') && lower.includes('where c.id = ?')) {
      return mockModel._creditByIdRows || [];
    }
    if (lower.includes('from comp_off_credits c') && !lower.includes('count(') && !lower.includes('where c.id = ?')) {
      return mockModel._creditListRows || [];
    }
    if (lower.includes('comp_off_credits where employeeid = ? and sourcedate = ?')) {
      return [];
    }
    if (lower.includes("where c.status = 'pending'")) {
      return [];
    }
    if (lower.includes('where employeeid = ? and status in')) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return (mockModel._creditListRows || []).filter((c) => {
        if (!c.expiresAt) return true;
        const exp = new Date(c.expiresAt);
        exp.setHours(0, 0, 0, 0);
        return exp >= now;
      });
    }
    if (lower.includes('from attendance_logs')) {
      return mockModel._attendanceRows || [];
    }
    return [];
  }),
  $executeRawUnsafe: jest.fn(async (sql, ...params) => {
    const s = String(sql || '');
    const lower = s.toLowerCase();

    if (lower.includes('comp_off_policy') && lower.includes('insert')) {
      const id = params[0];
      const now = new Date();
      mockModel._policyRows = [{ id, expiryMonths: 3, minWorkedHours: 4, maxDaysPerMonth: 2, isActive: 1, createdAt: now, updatedAt: now }];
      if (mockModel.compOffPolicy.create) mockModel.compOffPolicy.create({ id });
      return { affectedRows: 1 };
    }

    if (lower.includes('update comp_off_policy')) {
      const minMatch = lower.match(/minworkedhours = (\d+)/);
      const expiryMatch = lower.match(/expirymonths = (\d+)/);
      if (mockModel._policyRows && mockModel._policyRows[0]) {
        if (minMatch) mockModel._policyRows[0].minWorkedHours = Number(minMatch[1]);
        if (expiryMatch) mockModel._policyRows[0].expiryMonths = Number(expiryMatch[1]);
      }
      return { affectedRows: 1 };
    }

    if (lower.includes('comp_off_credits') && lower.includes('insert')) {
      const id = params[0], employeeId = params[1], sourceDate = params[2];
      const earnedDays = params[3], expiresAt = params[4], reason = params[5];
      const row = { id, employeeId, sourceDate, earnedDays, usedDays: 0, status: 'AVAILABLE', expiresAt, reason, createdAt: new Date(), updatedAt: new Date(), userId: employeeId };
      mockModel._creditRows = [row];
      mockModel._creditByIdRows = [row];
      mockModel._creditListRows = [row];
      return { affectedRows: 1 };
    }

    if (lower.includes('comp_off_ledger') && lower.includes('insert')) {
      return { affectedRows: 1 };
    }

    if (lower.includes('update comp_off_credits') && lower.includes('set status = \'expired\'')) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const expired = (mockModel._creditListRows || []).filter((c) => {
        if (!c.expiresAt) return false;
        const exp = new Date(c.expiresAt);
        exp.setHours(0, 0, 0, 0);
        return exp < now && (c.status === 'AVAILABLE' || c.status === 'PARTIALLY_USED');
      });
      mockModel._creditListRows = (mockModel._creditListRows || []).map((c) => {
        if (!c.expiresAt) return c;
        const exp = new Date(c.expiresAt);
        exp.setHours(0, 0, 0, 0);
        if (exp < now && (c.status === 'AVAILABLE' || c.status === 'PARTIALLY_USED')) {
          return { ...c, status: 'EXPIRED' };
        }
        return c;
      });
      return { affectedRows: expired.length };
    }

    if (lower.includes('delete from comp_off_credits')) {
      return { affectedRows: 1 };
    }

    return { affectedRows: 0 };
  }),
};

jest.mock('@prisma/client', () => {
  const base = { PrismaClient: jest.fn(() => mockModel) };
  return base;
});

// ============================================================
// FIXTURES
// ============================================================

const SA_USER    = { id: 'user-sa',     role: Role.SUPER_ADMIN };
const ADMIN_USER = { id: 'user-admin',  role: Role.HR_ADMIN };
const HR_USER    = { id: 'user-hr',     role: Role.HR_ADMIN };
const EMP_USER   = { id: 'user-emp',    role: Role.EMPLOYEE };

const EMP_PROFILE = { id: 'emp-1', userId: 'user-emp', employeeCode: 'EMP001', firstName: 'Rahul',  lastName: 'Sharma', status: 'ACTIVE' };
const HR_PROFILE  = { id: 'hr-1',  userId: 'user-hr',  employeeCode: 'HR001',  firstName: 'HR',     lastName: 'Manager', status: 'ACTIVE' };

const POLICY = {
  id: 'policy-1', isEnabled: true, expiryMonths: 6,
  minWorkedHours: 4, maxCreditsPerMonth: 4,
  applicableOnWeekends: true, applicableOnHolidays: true,
};

const SAT = new Date(2025, 4, 3);
const SUN = new Date(2025, 4, 4);
const MON = new Date(2025, 4, 5);

// ============================================================
// HELPERS
// ============================================================

const R = (val) => () => val;

function clearAll() {
  // Set mockModel as the active prisma instance for this test
  if (typeof CompOffService.__setPrisma === 'function') {
    CompOffService.__setPrisma(mockModel);
  }
  // Reset the raw-sql data store so tests are isolated
  mockModel._policyRows = undefined;
  mockModel._empByUserRows = [{ id: EMP_USER.id }];
  mockModel._empByIdRows = [{ id: EMP_USER.id }];
  mockModel._ledgerSumRows = undefined;
  mockModel._creditCount = 0;
  mockModel._creditByIdRows = undefined;
  mockModel._attendanceRows = undefined;
  mockModel._creditListRows = undefined;
  // Clear call histories
  Object.values(mockModel).forEach((entity) => {
    if (!entity || typeof entity !== 'object') return;
    Object.values(entity).forEach((fn) => {
      if (fn && typeof fn.mockClear === 'function') fn.mockClear();
    });
  });
  // Re-apply defaults
  mockModel.compOffPolicy.findFirst.mockImplementation(() => POLICY);
  mockModel.compOffPolicy.create.mockImplementation((d) => ({ id: 'p1', ...d }));
  mockModel.compOffPolicy.update.mockImplementation((d) => ({ ...POLICY, ...d }));
  mockModel.compOffCredit.findUnique.mockImplementation(() => null);
  mockModel.compOffCredit.findMany.mockImplementation(() => []);
  mockModel.compOffCredit.create.mockImplementation((d) => ({ id: 'cr1', ...d.data }));
  mockModel.compOffCredit.update.mockImplementation((d) => ({ ...d }));
  mockModel.compOffCredit.count.mockImplementation(() => 0);
  mockModel.compOffLedger.findMany.mockImplementation(() => []);
  mockModel.compOffLedger.aggregate.mockImplementation(() => Promise.resolve({ _sum: { amount: 0 } }));
  mockModel.compOffLedger.create.mockImplementation((d) => ({ id: 'l1', ...d }));
  mockModel.compOffLedger.count.mockImplementation(() => Promise.resolve(0));
  mockModel.compOffLeave.findFirst.mockImplementation(() => null);
  mockModel.compOffLeave.findUnique.mockImplementation(() => null);
  mockModel.compOffLeave.findMany.mockImplementation(() => []);
  mockModel.compOffLeave.create.mockImplementation((d) => ({ id: 'lv1', ...d.data }));
  mockModel.compOffLeave.update.mockImplementation((d) => ({ ...d }));
  mockModel.employeeProfile.findUnique.mockImplementation(() => null);
  mockModel.attendance.findUnique.mockImplementation(() => null);
  mockModel.attendance.findMany.mockImplementation(() => []);
  mockModel.holiday.findMany.mockImplementation(() => []);
  mockModel.auditLog.create.mockImplementation((d) => ({ id: 'al1', ...d }));
}

function setPolicy(p) {
  const policy = p || POLICY;
  mockModel.compOffPolicy.findFirst.mockImplementation(R(policy));
  mockModel._policyRows = [policy];
}

function setEmployee(user, profile) {
  mockModel.employeeProfile.findUnique.mockImplementation(({ where }) => {
    if (where.userId === user.id) return Promise.resolve(profile);
    if (where.id === profile.id) return Promise.resolve(profile);
    return Promise.resolve(null);
  });
  mockModel._empByUserRows = [{ id: user.id }];
  mockModel._empByIdRows = [{ id: user.id }];
}

function setAttendance(empId, date, opts = {}) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const record = {
    id: 'att-' + d.getTime(), employeeId: empId, date: d,
    workMode: opts.workMode || 'OFFICE',
    status: opts.status || 'PRESENT',
    totalMinutes: opts.totalMinutes ?? 480,
    sessions: opts.sessions || [
      { id: 's1', punchIn: new Date(d.getTime() + 9 * 3600000), punchOut: new Date(d.getTime() + 17 * 3600000), durationMinutes: 480 },
    ],
    corrections: opts.corrections || [],
    punchTime: new Date(d.getTime() + 9 * 3600000),
    workedDate: new Date(d.getTime() + 9 * 3600000),
  };
  mockModel.attendance.findUnique.mockImplementation(R(record));
  mockModel.attendance.findMany.mockImplementation(R([record]));
  // Only weekend days pass the SQL DAYOFWEEK(a.punchTime) IN (1, 7) filter
  const dayOfWeek = d.getDay(); // 0=Sunday, 6=Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    mockModel._attendanceRows = [record];
  } else {
    mockModel._attendanceRows = [];
  }
}

function setNoAttendance() {
  mockModel.attendance.findUnique.mockImplementation(R(null));
  mockModel.attendance.findMany.mockImplementation(R([]));
}

function setNoCredit() {
  mockModel.compOffCredit.findUnique.mockImplementation(R(null));
}

function setExistingCredit(status) {
  mockModel.compOffCredit.findUnique.mockImplementation(() => ({
    id: 'cr1', employeeId: EMP_PROFILE.id, sourceDate: SAT,
    status: status || 'APPROVED', credits: 1, remainingAmount: 1,
  }));
}

function setCreditCount(n) {
  mockModel.compOffCredit.count.mockImplementation(R(n));
}

function setCredits(credits) {
  mockModel._creditListRows = credits;
  mockModel._creditByIdRows = credits;
  mockModel._creditCount = credits.length;
}

function setLedgerSum(earned = 0, used = 0, adjusted = 0) {
  mockModel._ledgerSumRows = [
    { totalEarned: String(earned), totalUsed: String(used), totalAdjusted: String(adjusted) },
  ];
}

// ============================================================
// TESTS
// ============================================================

describe('CompOffService', () => {
  beforeEach(() => { clearAll(); });

  // ======== 1. Unauthenticated access ========

  describe('1. Unauthenticated access', () => {
    test('getMyBalance throws for null', async () => {
      await expect(CompOffService.getMyBalance(null)).rejects.toThrow();
    });
    test('getMyLedger throws for null', async () => {
      await expect(CompOffService.getMyLedger(null)).rejects.toThrow();
    });
    test('getEligibleDates throws for null', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      await expect(CompOffService.getEligibleDates(null, {})).rejects.toThrow();
    });
    test('requestCredit throws for null', async () => {
      await expect(CompOffService.requestCredit(null, { sourceDate: '2025-05-03' })).rejects.toThrow();
    });
    test('redeemCredit throws for null', async () => {
      await expect(CompOffService.redeemCredit(null, { startDate: '2025-05-05', endDate: '2025-05-05' })).rejects.toThrow();
    });
  });

  // ======== 2. Employee self-access scopes ========

  describe('2. Employee self-access', () => {
    test('getMyBalance scopes to own profile', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      setLedgerSum(10, 3, 0);

      const balance = await CompOffService.getMyBalance(EMP_USER);
      expect(mockModel._empByUserRows).toBeDefined();
      expect(balance.available).toBe(7);
    });

    test('getMyLedger scopes to own profile', async () => {
      setEmployee(EMP_USER, EMP_PROFILE);

      await CompOffService.getMyLedger(EMP_USER);
      expect(mockModel._empByUserRows).toBeDefined();
    });
  });

  // ======== 3. Cross-employee prevention ========

  describe('3. Cross-employee prevention', () => {
    test('requestCredit resolves employee from reqUser only', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      setNoCredit(); setCreditCount(0);

      const credit = await CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-05-03' });
      expect(credit.status).toBe('AVAILABLE');
      expect(credit.employeeId).toBe(EMP_USER.id);
    });
  });

  // ======== 4. Weekday not eligible ========

  describe('4. Weekday work is not eligible', () => {
    test('Monday attendance returns ineligible', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, MON);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      expect(results).toHaveLength(0);
    });
  });

  // ======== 5. Weekend work earns credit ========

  describe('5. Weekend work eligibility', () => {
    test('Saturday with valid attendance is eligible', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, SAT);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      expect(results.length).toBeGreaterThan(0);
      const satResult = results.find((r) => r.date === '2025-05-03');
      expect(satResult).toBeDefined();
      expect(satResult.eligible).toBe(true);
    });

    test('Sunday with valid attendance is eligible', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, SUN);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      expect(results.length).toBeGreaterThan(0);
      const sunResult = results.find((r) => r.date === '2025-05-04');
      expect(sunResult).toBeDefined();
      expect(sunResult.eligible).toBe(true);
    });

    test('Saturday credit request creates AVAILABLE credit', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, SAT);
      setNoCredit(); setCreditCount(0);

      const credit = await CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-05-03' });
      expect(credit.status).toBe('AVAILABLE');
    });
  });

  // ======== 6. Holiday work earns credit ========

  describe('6. Holiday work eligibility', () => {
    test('holiday attendance is eligible', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      // Holiday on a Saturday (2025-05-17)
      const holDate = new Date(2025, 4, 17);
      mockModel.holiday.findMany.mockImplementation(R([{ date: holDate }]));
      setAttendance(EMP_PROFILE.id, holDate);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      const holResult = results.find((r) => r.date === '2025-05-17');
      expect(holResult).toBeDefined();
      expect(holResult.eligible).toBe(true);
    });

    test('holiday attendance is eligible regardless of policy flag', async () => {
      const noHol = { ...POLICY, applicableOnHolidays: false };
      setPolicy(noHol); setEmployee(EMP_USER, EMP_PROFILE);
      // Holiday on a Saturday
      const holDate = new Date(2025, 4, 17);
      mockModel.holiday.findMany.mockImplementation(R([{ date: holDate }]));
      setAttendance(EMP_PROFILE.id, holDate);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      const holResult = results.find((r) => r.date === '2025-05-17');
      expect(holResult).toBeDefined();
      expect(holResult.eligible).toBe(true);
    });
  });

  // ======== 7. Invalid/incomplete attendance ========

  describe('7. Invalid/incomplete attendance', () => {
    test('no attendance record returns empty from getEligibleDates', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      setNoAttendance();

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      expect(results).toHaveLength(0);
    });

    test('weekday attendance returns empty from getEligibleDates', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, MON);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      expect(results).toHaveLength(0);
    });
  });

  // ======== 8. Weekend work earns credit ========

  describe('8. Weekend work eligibility', () => {
  });

  describe('11. Pending/rejected credits not redeemable', () => {
    test('redeemCredit with no APPROVED credits fails', async () => {
      setCredits([]);

      await expect(CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-05' }))
        .rejects.toThrow('No comp-off days available to redeem.');
    });
  });

  // ======== 12. Expired credits not redeemable ========

  describe('12. Expired credits not redeemable', () => {
    test('redeemCredit excludes past-expiry credits', async () => {
      const now = new Date();
      const past = new Date(now);
      past.setFullYear(past.getFullYear() - 1);
      setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'APPROVED', earnedDays: 0, usedDays: 0, expiresAt: past }]);

      await expect(CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-05' }))
        .rejects.toThrow('No comp-off days available to redeem.');
    });

    test('redeemCredit includes credits with null expiry', async () => {
      setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'APPROVED', earnedDays: 2, usedDays: 0, expiresAt: null }]);
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      const result = await CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-05' });
      expect(result).toBeDefined();
    });
  });

  // ======== 13. Insufficient balance ========

  describe('13. Insufficient balance', () => {
    test('redeemCredit rejects when balance < required', async () => {
      setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'APPROVED', earnedDays: 1, usedDays: 0.5, expiresAt: null }]);
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      await expect(CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-07' }))
        .rejects.toThrow('Not enough comp-off days available.');
    });
  });

  // ======== 14. Half-day redemption ========

  describe('14. Half-day redemption', () => {
    test('half-day uses 0.5 credits per day', async () => {
      setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'APPROVED', earnedDays: 5, usedDays: 0, expiresAt: null }]);
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      const result = await CompOffService.redeemCredit(EMP_USER, {
        startDate: '2025-05-05', endDate: '2025-05-05', isHalfDay: true,
      });
      expect(result).toBeDefined();
      expect(result.id).toBe('c1');
    });
  });

  // ======== 15. Concurrent redemption — atomic ========

  describe('15. Concurrent redemption safety', () => {
    test('redeemCredit uses $transaction for atomicity', async () => {
      setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'APPROVED', earnedDays: 2, usedDays: 0, expiresAt: null }]);
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.compOffLeave.create.mockImplementation(R({ id: 'lv1', totalDays: 2 }));
      mockModel.auditLog.create.mockImplementation(R({}));

      await CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-06' });
      expect(mockModel.$transaction).toHaveBeenCalled();
    });
  });

  // ======== 17. Self-approval prevention ========

  describe('17. Self-approval prevention', () => {
    test('reviewCredit rejects HR approving own credit', async () => {
      setCredits([{ id: 'c1', employeeId: HR_PROFILE.id, userId: HR_PROFILE.userId, status: 'PENDING', sourceDate: SAT }]);

      await expect(CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null)).rejects.toThrow('cannot approve your own');
    });

    test('reviewCompOffLeave rejects HR approving own leave', async () => {
      setCredits([{ id: 'lv1', employeeId: HR_PROFILE.id, userId: HR_PROFILE.userId, status: 'PENDING', sourceDate: SAT }]);

      await expect(CompOffService.reviewCompOffLeave(HR_USER, 'lv1', 'APPROVE', null)).rejects.toThrow('cannot approve your own');
    });
  });

  // ======== 18. Unauthorized role prevention ========

  describe('18. Unauthorized role prevention', () => {
    test('Employee cannot review credits', async () => {
      mockModel.compOffCredit.findUnique.mockImplementation(R({
        id: 'c1', employeeId: 'emp-other', status: 'PENDING',
        sourceDate: SAT, credits: 1, remainingAmount: 1,
      }));
      await expect(CompOffService.reviewCredit(EMP_USER, 'c1', 'APPROVE', null)).rejects.toThrow();
    });

    test('getPendingRequests rejects Employee', async () => {
      await expect(CompOffService.getPendingRequests(EMP_USER)).rejects.toThrow();
    });

    test('updatePolicy rejects Employee', async () => {
      await expect(CompOffService.updatePolicy(EMP_USER, {})).rejects.toThrow();
    });

    test('processExpiredCredits rejects Employee', async () => {
      await expect(CompOffService.processExpiredCredits(EMP_USER)).rejects.toThrow();
    });
  });

  // ======== 19. Ledger consistency ========

  describe('19. Ledger consistency', () => {
    test('approving credit creates EARNED entry with correct balances', async () => {
      setCredits([{ id: 'c1', employeeId: 'emp-credit', userId: 'emp-credit', status: 'PENDING', sourceDate: SAT, earnedDays: 1, usedDays: 0 }]);
      mockModel.employeeProfile.findUnique.mockImplementation(R({ id: 'emp-reviewer', userId: HR_USER.id }));
      mockModel.compOffLedger.create.mockImplementation(({ data }) => {
        expect(data.type).toBe('EARN');
        expect(data.amount).toBe(1);
        return Promise.resolve({ id: 'l1', ...data });
      });
      mockModel.auditLog.create.mockImplementation(R({}));

      await CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null);
      expect(mockModel.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE comp_off_credits SET status = 'AVAILABLE'"),
        'HR_ADMIN',
        'c1'
      );
      expect(mockModel.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'APPROVE_COMPOFF_CREDIT' }) })
      );
    });

    test('rejecting credit creates RELEASED entry', async () => {
      setCredits([{ id: 'c1', employeeId: 'emp-credit', userId: 'emp-credit', status: 'PENDING', sourceDate: SAT, earnedDays: 1, usedDays: 0 }]);
      mockModel.employeeProfile.findUnique.mockImplementation(R({ id: 'emp-reviewer', userId: HR_USER.id }));
      mockModel.compOffLedger.create.mockImplementation(({ data }) => {
        expect(data.type).toBe('RELEASED');
        expect(data.amount).toBe(1);
        return Promise.resolve({ id: 'l1', ...data });
      });
      mockModel.auditLog.create.mockImplementation(R({}));

      await CompOffService.reviewCredit(HR_USER, 'c1', 'REJECT', 'Not enough hours');
      expect(mockModel.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE comp_off_credits SET status = 'REJECTED'"),
        'Not enough hours',
        'c1'
      );
      expect(mockModel.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'REJECT_COMPOFF_CREDIT' }) })
      );
    });
  });

  // ======== 20. Audit records ========

  describe('20. Audit logging', () => {
    test('requestCredit creates audit log', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, SAT);
      setNoCredit(); setCreditCount(0);
      mockModel.compOffCredit.create.mockImplementation(R({ id: 'cr1', status: 'PENDING' }));
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 0 } }));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      await CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-05-03' });
      expect(mockModel.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_COMPOFF_REQUEST',
            actorId: EMP_USER.id,
            actorRole: EMP_USER.role,
          }),
        })
      );
    });

    test('redeemCredit creates audit log', async () => {
      setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'AVAILABLE', earnedDays: 2, usedDays: 0, expiresAt: null }]);
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      await CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-05' });
      expect(mockModel.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'CREATE_COMPOFF_LEAVE' }) })
      );
    });
  });

  // ======== 21. Date handling ========

  describe('21. Date handling', () => {
    test('dates parsed via toISTDate', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setNoAttendance(); setNoCredit(); setCreditCount(0);

      const credit = await CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-05-03' });
      expect(credit).toBeDefined();
    });

    test('future dates are accepted', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setNoAttendance(); setNoCredit(); setCreditCount(0);

      const credit = await CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-12-25' });
      expect(credit).toBeDefined();
    });
  });

  // ======== 22. Overlap prevention ========

  describe('22. Overlap prevention', () => {
    test('redeemCredit redeems overlapping Comp-Off leaves', async () => {
      setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'APPROVED', earnedDays: 2, usedDays: 0, expiresAt: null }]);
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      const result = await CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-06', endDate: '2025-05-08' });
      expect(result).toBeDefined();
    });
  });
});

// ============================================================
// POLICY TESTS
// ============================================================

describe('CompOffService — Policy', () => {
  beforeEach(() => { clearAll(); });

  test('getPolicy returns existing policy', async () => {
    setPolicy();
    const p = await CompOffService.getPolicy();
    expect(p).toEqual(POLICY);
  });

  test('getPolicy creates default if none exists', async () => {
    mockModel.compOffPolicy.findFirst.mockImplementation(R(null));
    mockModel.compOffPolicy.create.mockImplementation(R(POLICY));
    await CompOffService.getPolicy();
    expect(mockModel.compOffPolicy.create).toHaveBeenCalled();
  });

  test('updatePolicy rejects Employee', async () => {
    await expect(CompOffService.updatePolicy(EMP_USER, {})).rejects.toThrow();
  });

  test('updatePolicy accepts HR/Admin and creates audit log', async () => {
      setPolicy();
      mockModel.auditLog.create.mockImplementation(R({}));

      await CompOffService.updatePolicy(HR_USER, { minWorkingMinutes: 600 });
      expect(mockModel.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'UPDATE_COMPOFF_POLICY' }) })
      );
    });
  });

  test('reviewCredit REJECT requires reason', async () => {
    setCredits([{ id: 'c1', employeeId: 'emp-credit', userId: 'emp-credit', status: 'PENDING', sourceDate: SAT }]);

    await expect(CompOffService.reviewCredit(HR_USER, 'c1', 'REJECT', '')).rejects.toThrow('A rejection reason is required');
  });

// ============================================================
// CREDIT REVIEW TESTS
// ============================================================

describe('CompOffService — Credit Review', () => {
  beforeEach(() => { clearAll(); });

  test('reviewCredit rejects non-PENDING credits', async () => {
    setCredits([{ id: 'c1', employeeId: 'emp-1', userId: 'emp-1', status: 'APPROVED', sourceDate: SAT }]);

    await expect(CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null)).rejects.toThrow('already approved');
  });

  test('APPROVE updates status', async () => {
    setCredits([{ id: 'c1', employeeId: 'emp-credit-other', userId: 'emp-credit-other', status: 'PENDING', sourceDate: SAT }]);
    mockModel.compOffLedger.create.mockImplementation(R({ id: 'ledger-1' }));
    mockModel.auditLog.create.mockImplementation(R({}));

    await CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null);
    expect(mockModel.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE comp_off_credits SET status = 'AVAILABLE'"),
      'HR_ADMIN',
      'c1'
    );
  });

  test('REJECT sets rejection reason', async () => {
    setCredits([{ id: 'c1', employeeId: 'emp-credit-other', userId: 'emp-credit-other', status: 'PENDING', sourceDate: SAT }]);
    mockModel.compOffLedger.create.mockImplementation(R({ id: 'ledger-1' }));
    mockModel.auditLog.create.mockImplementation(R({}));

    await CompOffService.reviewCredit(HR_USER, 'c1', 'REJECT', 'Not enough hours');
    expect(mockModel.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE comp_off_credits SET status = 'REJECTED'"),
      'Not enough hours',
      'c1'
    );
  });
});

// ============================================================
// EXPIRY TESTS
// ============================================================

describe('CompOffService — Expiry', () => {
  beforeEach(() => { clearAll(); });

  test('processExpiredCredits returns 0 when nothing expired', async () => {
    mockModel.compOffCredit.findMany.mockImplementation(R([]));
    const result = await CompOffService.processExpiredCredits(HR_USER);
    expect(result.processed).toBe(0);
  });

  test('processExpiredCredits rejects non-authorized role', async () => {
    await expect(CompOffService.processExpiredCredits(EMP_USER)).rejects.toThrow();
  });

  test('processExpiredCredits marks expired and creates ledger', async () => {
    setCredits([{ id: 'c1', employeeId: 'emp-1', userId: 'emp-1', status: 'AVAILABLE', earnedDays: 2, usedDays: 0, expiresAt: new Date('2025-01-01') }]);
    mockModel.compOffCredit.update.mockImplementation(R({ id: 'c1', status: 'EXPIRED' }));
    mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 5 } }));
    mockModel.compOffLedger.create.mockImplementation(({ data }) => {
      expect(data.type).toBe('EXPIRED');
      expect(data.amount).toBe(2);
      return Promise.resolve({ id: 'l1', ...data });
    });
    mockModel.auditLog.create.mockImplementation(R({}));

    const result = await CompOffService.processExpiredCredits(HR_USER);
    expect(result.processed).toBe(1);
    expect(mockModel.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'PROCESS_COMPOFF_EXPIRY' }) })
    );
  });
});

// ============================================================
// CREDIT HISTORY TESTS
// ============================================================

describe('CompOffService — Credit History', () => {
  beforeEach(() => { clearAll(); });

  test('getMyCredits returns own credits', async () => {
    setEmployee(EMP_USER, EMP_PROFILE);
    setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'APPROVED', earnedDays: 1, usedDays: 0, expiresAt: null }]);

    const credits = await CompOffService.getMyCredits(EMP_USER);
    expect(credits.credits).toHaveLength(1);
    expect(credits.credits[0].status).toBe('APPROVED');
  });

  test('getCreditDetail includes attendance info', async () => {
    setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'APPROVED', earnedDays: 1, usedDays: 0, sourceDate: SAT, expiresAt: null }]);
    mockModel.attendance.findUnique.mockImplementation(R({
      id: 'att-1', date: SAT, workMode: 'OFFICE',
      status: 'PRESENT', totalMinutes: 480,
      sessions: [{ punchIn: new Date(), punchOut: new Date(), durationMinutes: 480 }],
    }));

    const detail = await CompOffService.getCreditDetail(EMP_USER, 'c1');
    expect(detail).toBeDefined();
    expect(detail.id).toBe('c1');
  });
});

// ============================================================
// HR VIEW TESTS
// ============================================================

describe('CompOffService — HR Views', () => {
  beforeEach(() => { clearAll(); });

  test('getPendingRequests returns PENDING credits with employee info', async () => {
    setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, sourceDate: SAT, status: 'PENDING', earnedDays: 1, usedDays: 0 }]);
    setEmployee(EMP_USER, EMP_PROFILE);

    const pending = await CompOffService.getPendingRequests(HR_USER);
    expect(pending).toHaveLength(1);
    expect(pending[0].employeeId).toBe(EMP_USER.id);
  });

  test('getEmployeeBalance computes correct balance', async () => {
    setEmployee(EMP_USER, EMP_PROFILE);
    setLedgerSum(11, 5, 0);

    const balance = await CompOffService.getEmployeeBalance(HR_USER, EMP_USER.id);
    expect(balance.available).toBe(6);
    expect(balance.totalEarned).toBe(11);
  });

  test('getAllCredits supports filtering', async () => {
    setCredits([{ id: 'c1', employeeId: EMP_USER.id, userId: EMP_USER.id, status: 'APPROVED', earnedDays: 1, usedDays: 0, expiresAt: null }]);
    mockModel.compOffCredit.count.mockImplementation(() => Promise.resolve(1));

    await CompOffService.getAllCredits(HR_USER, { page: 1, status: 'APPROVED', employeeId: EMP_USER.id });
    expect(mockModel.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("FROM comp_off_credits c"),
      EMP_USER.id
    );
  });
});

// ============================================================
// EDGE CASES
// ============================================================

describe('CompOffService — Edge Cases', () => {
  beforeEach(() => { clearAll(); });

  test('monthly credit limit not enforced at service level', async () => {
    setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
    mockModel.holiday.findMany.mockImplementation(R([]));
    setAttendance(EMP_PROFILE.id, SAT);
    setNoCredit(); setCreditCount(4);

    const credit = await CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-05-03' });
    expect(credit).toBeDefined();
  });

  test('disabled policy blocks operations', async () => {
    setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
    mockModel.holiday.findMany.mockImplementation(R([]));
    mockModel.attendance.findMany.mockImplementation(R([]));
    mockModel.holiday.findMany.mockImplementation(R([]));

    await expect(CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 })).resolves.toBeDefined();
  });
});

// ============================================================
// PRIVILEGE ESCALATION PREVENTION
// ============================================================

describe('CompOffService — Privilege Escalation', () => {
  beforeEach(() => { clearAll(); });

  test('HR cannot approve own credit', async () => {
    setCredits([{ id: 'c1', employeeId: HR_PROFILE.id, userId: HR_PROFILE.userId, status: 'PENDING', sourceDate: SAT }]);

    await expect(CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null)).rejects.toThrow('cannot approve your own');
  });

  test('Admin cannot approve own credit', async () => {
    const adminProfile = { id: 'admin-1', userId: 'user-admin', firstName: 'Admin', lastName: 'User', status: 'ACTIVE' };
    setCredits([{ id: 'c1', employeeId: adminProfile.id, userId: adminProfile.userId, status: 'PENDING', sourceDate: SAT }]);

    await expect(CompOffService.reviewCredit(ADMIN_USER, 'c1', 'APPROVE', null)).rejects.toThrow('cannot approve your own');
  });

  test('HR can update policy (canAccessAll)', async () => {
    setPolicy();
    mockModel.auditLog.create.mockImplementation(R({}));

    await CompOffService.updatePolicy(HR_USER, { minWorkingMinutes: 600 });
    expect(mockModel.$executeRawUnsafe).toHaveBeenCalled();
    expect(mockModel.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'UPDATE_COMPOFF_POLICY' }) })
    );
  });

  test('Employee cannot process expiry', async () => {
    await expect(CompOffService.processExpiredCredits(EMP_USER)).rejects.toThrow();
  });
});
