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
};

jest.mock('@prisma/client', () => {
  const base = { PrismaClient: jest.fn(() => mockModel) };
  return base;
});

// ============================================================
// FIXTURES
// ============================================================

const SA_USER    = { id: 'user-sa',     role: Role.SUPER_ADMIN };
const ADMIN_USER = { id: 'user-admin',  role: Role.ADMIN };
const HR_USER    = { id: 'user-hr',     role: Role.HR };
const EMP_USER   = { id: 'user-emp',    role: Role.EMPLOYEE };

const EMP_PROFILE = { id: 'emp-1', userId: 'user-emp', employeeCode: 'EMP001', firstName: 'Rahul',  lastName: 'Sharma', status: 'ACTIVE' };
const HR_PROFILE  = { id: 'hr-1',  userId: 'user-hr',  employeeCode: 'HR001',  firstName: 'HR',     lastName: 'Manager', status: 'ACTIVE' };

const POLICY = {
  id: 'policy-1', isEnabled: true, creditExpiryMonths: 6,
  minWorkingMinutes: 480, maxCreditsPerMonth: 4,
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
  mockModel.compOffPolicy.findFirst.mockImplementation(R(p || POLICY));
}

function setEmployee(user, profile) {
  mockModel.employeeProfile.findUnique.mockImplementation(({ where }) => {
    if (where.userId === user.id) return Promise.resolve(profile);
    if (where.id === profile.id) return Promise.resolve(profile);
    return Promise.resolve(null);
  });
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
  };
  mockModel.attendance.findUnique.mockImplementation(R(record));
  mockModel.attendance.findMany.mockImplementation(R([record]));
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
      mockModel.compOffLedger.aggregate.mockImplementation(({ where }) => {
        return Promise.resolve({ _sum: { amount: where.type === 'EARNED' ? 10 : where.type === 'USED' ? 3 : 1 } });
      });

      const balance = await CompOffService.getMyBalance(EMP_USER);
      expect(mockModel.employeeProfile.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: EMP_USER.id } })
      );
      expect(balance.availableBalance).toBe(6);
    });

    test('getMyLedger scopes to own profile', async () => {
      setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.compOffLedger.findMany.mockImplementation(R([]));
      mockModel.compOffLedger.count.mockImplementation(() => Promise.resolve(0));

      await CompOffService.getMyLedger(EMP_USER);
      expect(mockModel.compOffLedger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: EMP_PROFILE.id } })
      );
    });
  });

  // ======== 3. Cross-employee prevention ========

  describe('3. Cross-employee prevention', () => {
    test('requestCredit resolves employee from reqUser only', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setNoAttendance(); setNoCredit(); setCreditCount(0);

      await expect(CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-05-03' }))
        .rejects.toThrow('No attendance record found');
      expect(mockModel.attendance.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId_date: { employeeId: EMP_PROFILE.id, date: expect.any(Date) } },
        })
      );
    });
  });

  // ======== 4. Weekday not eligible ========

  describe('4. Weekday work is not eligible', () => {
    test('Monday attendance returns ineligible', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, MON);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      const monResult = results.find((r) => r.dateKey === '2025-05-05');
      expect(monResult).toBeDefined();
      expect(monResult.eligible).toBe(false);
      expect(monResult.dateType).toBe('WEEKDAY');
      expect(monResult.reason).toMatch(/not applicable/i);
    });
  });

  // ======== 5. Weekend work earns credit ========

  describe('5. Weekend work eligibility', () => {
    test('Saturday with valid attendance is eligible', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, SAT);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      const satResult = results.find((r) => r.dateKey === '2025-05-03');
      expect(satResult).toBeDefined();
      expect(satResult.eligible).toBe(true);
      expect(satResult.dateType).toBe('WEEKEND');
    });

    test('Sunday with valid attendance is eligible', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, SUN);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      const sunResult = results.find((r) => r.dateKey === '2025-05-04');
      expect(sunResult).toBeDefined();
      expect(sunResult.eligible).toBe(true);
      expect(sunResult.dateType).toBe('WEEKEND');
    });

    test('Saturday credit request creates PENDING credit with audit', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setAttendance(EMP_PROFILE.id, SAT);
      setNoCredit(); setCreditCount(0);
      mockModel.compOffCredit.create.mockImplementation(R({ id: 'cr-new', status: 'PENDING' }));
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 0 } }));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      const credit = await CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-05-03' });
      expect(credit.status).toBe('PENDING');
      expect(mockModel.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'CREATE_COMPOFF_REQUEST' }) })
      );
    });
  });

  // ======== 6. Holiday work earns credit ========

  describe('6. Holiday work eligibility', () => {
    test('holiday attendance is eligible when applicableOnHolidays is true', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      const holDate = new Date(2025, 4, 20);
      mockModel.holiday.findMany.mockImplementation(R([{ date: holDate }]));
      setAttendance(EMP_PROFILE.id, holDate);

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      const holResult = results.find((r) => r.dateKey === '2025-05-20');
      expect(holResult).toBeDefined();
      expect(holResult.eligible).toBe(true);
      expect(holResult.dateType).toBe('HOLIDAY');
    });

    test('holiday attendance NOT eligible when policy disables it', async () => {
      const noHol = { ...POLICY, applicableOnHolidays: false };
      setPolicy(noHol); setEmployee(EMP_USER, EMP_PROFILE);
      const holDate = new Date(2025, 4, 20);
      mockModel.holiday.findMany.mockImplementation(R([{ date: holDate }]));
      mockModel.attendance.findMany.mockImplementation(() => Promise.resolve([
        { id: 'a1', date: holDate, status: 'PRESENT', totalMinutes: 480, sessions: [], corrections: [] },
      ]));

      const results = await CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 });
      const holResult = results.find((r) => r.dateKey === '2025-05-20');
      expect(holResult).toBeDefined();
      expect(holResult.eligible).toBe(false);
    });
  });

  // ======== 7. Invalid/incomplete attendance ========

  describe('7. Invalid/incomplete attendance', () => {
    test('no attendance record is ineligible', async () => {
      setPolicy();
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      setNoAttendance();

      const eligibility = await CompOffService._checkEligibility(EMP_PROFILE.id, SAT, POLICY, new Set());
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toMatch(/no attendance record/i);
    });

    test('no completed sessions is ineligible', async () => {
      setPolicy();
      mockModel.attendance.findUnique.mockImplementation(R({
        id: 'a1', employeeId: EMP_PROFILE.id, date: SAT,
        status: 'PRESENT', totalMinutes: 0,
        sessions: [{ id: 's1', punchIn: new Date(), punchOut: null, durationMinutes: 0 }],
        corrections: [],
      }));

      const eligibility = await CompOffService._checkEligibility(EMP_PROFILE.id, SAT, POLICY, new Set());
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toMatch(/completed work sessions/i);
    });

    test('below minimum minutes is ineligible', async () => {
      setPolicy();
      mockModel.attendance.findUnique.mockImplementation(R({
        id: 'a1', employeeId: EMP_PROFILE.id, date: SAT,
        status: 'PRESENT', totalMinutes: 120,
        sessions: [{ id: 's1', punchIn: new Date(), punchOut: new Date(), durationMinutes: 120 }],
        corrections: [],
      }));

      const eligibility = await CompOffService._checkEligibility(EMP_PROFILE.id, SAT, POLICY, new Set());
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toMatch(/below the minimum/i);
    });

    test('ABSENT status is ineligible', async () => {
      setPolicy();
      mockModel.attendance.findUnique.mockImplementation(R({
        id: 'a1', employeeId: EMP_PROFILE.id, date: SAT,
        status: 'ABSENT', totalMinutes: 0, sessions: [], corrections: [],
      }));

      const eligibility = await CompOffService._checkEligibility(EMP_PROFILE.id, SAT, POLICY, new Set());
      expect(eligibility.eligible).toBe(false);
    });
  });

  // ======== 8. Approved attendance corrections ========

  describe('8. Approved attendance corrections', () => {
    test('approved correction with PRESENT and valid sessions makes eligible', async () => {
      setPolicy();
      mockModel.attendance.findUnique.mockImplementation(R({
        id: 'a1', employeeId: EMP_PROFILE.id, date: SAT,
        status: 'ABSENT', totalMinutes: 480,
        sessions: [{ id: 's1', punchIn: new Date(), punchOut: new Date(), durationMinutes: 480 }],
        corrections: [{ id: 'c1', status: 'APPROVED', correctedStatus: 'PRESENT' }],
      }));
      setNoCredit();

      const eligibility = await CompOffService._checkEligibility(EMP_PROFILE.id, SAT, POLICY, new Set());
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.hasApprovedCorrection).toBe(true);
    });
  });

  // ======== 9. WFH as work mode ========

  describe('9. WFH as work mode', () => {
    test('WFH with sufficient hours IS eligible (just a work mode)', async () => {
      setPolicy();
      mockModel.attendance.findUnique.mockImplementation(R({
        id: 'a1', employeeId: EMP_PROFILE.id, date: SAT,
        workMode: 'WFH', status: 'PRESENT', totalMinutes: 480,
        sessions: [{ id: 's1', punchIn: new Date(), punchOut: new Date(), durationMinutes: 480 }],
        corrections: [],
      }));
      setNoCredit();

      const eligibility = await CompOffService._checkEligibility(EMP_PROFILE.id, SAT, POLICY, new Set());
      expect(eligibility.eligible).toBe(true);
    });

    test('WFH with insufficient hours is NOT eligible', async () => {
      setPolicy();
      mockModel.attendance.findUnique.mockImplementation(R({
        id: 'a1', employeeId: EMP_PROFILE.id, date: SAT,
        workMode: 'WFH', status: 'PRESENT', totalMinutes: 120,
        sessions: [{ id: 's1', punchIn: new Date(), punchOut: new Date(), durationMinutes: 120 }],
        corrections: [],
      }));

      const eligibility = await CompOffService._checkEligibility(EMP_PROFILE.id, SAT, POLICY, new Set());
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toMatch(/below the minimum/i);
    });
  });

  // ======== 10. Duplicate credit prevention ========

  describe('10. Duplicate credit prevention', () => {
    test('existing approved credit makes date ineligible', async () => {
      mockModel.attendance.findUnique.mockImplementation(R({
        id: 'a1', employeeId: EMP_PROFILE.id, date: SAT,
        status: 'PRESENT', totalMinutes: 480,
        sessions: [{ punchIn: new Date(), punchOut: new Date(), durationMinutes: 480 }],
        corrections: [],
      }));
      setExistingCredit('APPROVED');

      const eligibility = await CompOffService._checkEligibility(EMP_PROFILE.id, SAT, POLICY, new Set());
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toMatch(/already exists/i);
      expect(eligibility.existingStatus).toBe('APPROVED');
    });

    test('existing pending credit also blocks', async () => {
      mockModel.attendance.findUnique.mockImplementation(R({
        id: 'a1', employeeId: EMP_PROFILE.id, date: SAT,
        status: 'PRESENT', totalMinutes: 480,
        sessions: [{ punchIn: new Date(), punchOut: new Date(), durationMinutes: 480 }],
        corrections: [],
      }));
      setExistingCredit('PENDING');

      const eligibility = await CompOffService._checkEligibility(EMP_PROFILE.id, SAT, POLICY, new Set());
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.existingStatus).toBe('PENDING');
    });
  });

  // ======== 11. Pending/rejected credits not redeemable ========

  describe('11. Pending/rejected credits not redeemable', () => {
    test('redeemCredit with no APPROVED credits fails', async () => {
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findFirst.mockImplementation(R(null));
      mockModel.compOffCredit.findMany.mockImplementation(R([]));
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 0 } }));

      await expect(CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-05' }))
        .rejects.toThrow('Insufficient Comp-Off balance');
    });
  });

  // ======== 12. Expired credits not redeemable ========

  describe('12. Expired credits not redeemable', () => {
    test('redeemCredit excludes past-expiry credits', async () => {
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findFirst.mockImplementation(R(null));
      const now = new Date();
      mockModel.compOffCredit.findMany.mockImplementation(() => {
        const past = new Date(now);
        past.setFullYear(past.getFullYear() - 1);
        return [
          { id: 'c1', employeeId: EMP_PROFILE.id, status: 'APPROVED', remainingAmount: 0, expiresAt: past },
        ];
      });
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 0 } }));

      await expect(CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-05' }))
        .rejects.toThrow('Insufficient Comp-Off balance');
    });

    test('redeemCredit includes credits with null expiry', async () => {
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findFirst.mockImplementation(R(null));
      mockModel.compOffCredit.findMany.mockImplementation(() => [
        { id: 'c1', employeeId: EMP_PROFILE.id, status: 'APPROVED', remainingAmount: 2, expiresAt: null },
      ]);
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 0 } }));
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      const result = await CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-05' });
      expect(result).toBeDefined();
      expect(result.totalDays).toBe(1);
    });
  });

  // ======== 13. Insufficient balance ========

  describe('13. Insufficient balance', () => {
    test('redeemCredit rejects when balance < required', async () => {
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findFirst.mockImplementation(R(null));
      mockModel.compOffCredit.findMany.mockImplementation(() => [
        { id: 'c1', employeeId: EMP_PROFILE.id, status: 'APPROVED', remainingAmount: 0.5, expiresAt: null },
      ]);
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 0 } }));

      await expect(CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-07' }))
        .rejects.toThrow('Insufficient Comp-Off balance');
    });
  });

  // ======== 14. Half-day redemption ========

  describe('14. Half-day redemption', () => {
    test('half-day uses 0.5 credits per day', async () => {
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findFirst.mockImplementation(R(null));
      mockModel.compOffCredit.findMany.mockImplementation(() => [
        { id: 'c1', employeeId: EMP_PROFILE.id, status: 'APPROVED', remainingAmount: 5, expiresAt: null },
      ]);
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 10 } }));
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      const result = await CompOffService.redeemCredit(EMP_USER, {
        startDate: '2025-05-05', endDate: '2025-05-05', isHalfDay: true,
      });
      expect(result.totalDays).toBe(0.5);
    });
  });

  // ======== 15. Concurrent redemption — atomic ========

  describe('15. Concurrent redemption safety', () => {
    test('redeemCredit uses $transaction for atomicity', async () => {
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findFirst.mockImplementation(R(null));
      mockModel.compOffCredit.findMany.mockImplementation(() => [
        { id: 'c1', employeeId: EMP_PROFILE.id, status: 'APPROVED', remainingAmount: 2, expiresAt: null },
      ]);
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 10 } }));
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.compOffLedger.create.mockImplementation(R({}));
      mockModel.compOffLeave.create.mockImplementation(R({ id: 'lv1', totalDays: 2 }));
      mockModel.auditLog.create.mockImplementation(R({}));

      await CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-05', endDate: '2025-05-06' });
      expect(mockModel.$transaction).toHaveBeenCalled();
    });
  });

  // ======== 16. Cancellation restores credits ========

  describe('16. Cancellation restores credits', () => {
    test('cancelLeave restores deducted credits', async () => {
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findUnique.mockImplementation(R({
        id: 'lv1', employeeId: EMP_PROFILE.id, status: 'PENDING',
        startDate: new Date('2025-05-05'), endDate: new Date('2025-05-05'),
        totalDays: 1, reason: 'test',
      }));
      mockModel.compOffLedger.findMany.mockImplementation(R([
        { id: 'l1', creditId: 'c1', amount: 1, credit: { id: 'c1', remainingAmount: 0 } },
      ]));
      mockModel.compOffLeave.update.mockImplementation(R({ id: 'lv1', status: 'CANCELLED' }));
      mockModel.compOffCredit.update.mockImplementation(R({}));
      mockModel.auditLog.create.mockImplementation(R({}));

      const result = await CompOffService.cancelLeave(EMP_USER, 'lv1');
      expect(result.status).toBe('CANCELLED');
      expect(mockModel.$transaction).toHaveBeenCalled();
    });

    test('cancelLeave rejects non-PENDING leave', async () => {
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findUnique.mockImplementation(R({
        id: 'lv1', employeeId: EMP_PROFILE.id, status: 'APPROVED',
      }));

      await expect(CompOffService.cancelLeave(EMP_USER, 'lv1')).rejects.toThrow('Cannot cancel');
    });
  });

  // ======== 17. Self-approval prevention ========

  describe('17. Self-approval prevention', () => {
    test('reviewCredit rejects HR approving own credit', async () => {
      mockModel.compOffCredit.findUnique.mockImplementation(R({
        id: 'c1', employeeId: HR_PROFILE.id, status: 'PENDING',
        sourceDate: SAT, credits: 1, remainingAmount: 1,
      }));
      mockModel.employeeProfile.findUnique.mockImplementation(R(HR_PROFILE));

      await expect(CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null)).rejects.toThrow('cannot approve your own');
    });

    test('reviewCompOffLeave rejects HR approving own leave', async () => {
      mockModel.compOffLeave.findUnique.mockImplementation(R({
        id: 'lv1', employeeId: HR_PROFILE.id, status: 'PENDING',
        startDate: new Date('2025-05-05'), endDate: new Date('2025-05-05'), totalDays: 1,
      }));
      mockModel.employeeProfile.findUnique.mockImplementation(R(HR_PROFILE));

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
      mockModel.compOffCredit.findUnique.mockImplementation(R({
        id: 'c1', employeeId: 'emp-credit', status: 'PENDING',
        sourceDate: SAT, credits: 1, remainingAmount: 1,
      }));
      mockModel.employeeProfile.findUnique.mockImplementation(R({ id: 'emp-reviewer', userId: HR_USER.id }));
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 5 } }));
      mockModel.compOffCredit.update.mockImplementation(R({ id: 'c1', status: 'APPROVED' }));
      mockModel.compOffLedger.create.mockImplementation(({ data }) => {
        expect(data.type).toBe('EARNED');
        expect(data.amount).toBe(1);
        expect(data.balanceBefore).toBe(5);
        expect(data.balanceAfter).toBe(6);
        return Promise.resolve({ id: 'l1', ...data });
      });
      mockModel.auditLog.create.mockImplementation(R({}));

      await CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null);
      expect(mockModel.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'APPROVE_COMPOFF_CREDIT' }) })
      );
    });

    test('rejecting credit creates RELEASED entry', async () => {
      mockModel.compOffCredit.findUnique.mockImplementation(R({
        id: 'c1', employeeId: 'emp-credit', status: 'PENDING',
        sourceDate: SAT, credits: 1, remainingAmount: 1,
      }));
      mockModel.employeeProfile.findUnique.mockImplementation(R({ id: 'emp-reviewer', userId: HR_USER.id }));
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 5 } }));
      mockModel.compOffCredit.update.mockImplementation(R({ id: 'c1', status: 'REJECTED' }));
      mockModel.compOffLedger.create.mockImplementation(({ data }) => {
        expect(data.type).toBe('RELEASED');
        expect(data.reason).toMatch(/rejected/i);
        return Promise.resolve({ id: 'l1', ...data });
      });
      mockModel.auditLog.create.mockImplementation(R({}));

      await CompOffService.reviewCredit(HR_USER, 'c1', 'REJECT', 'Not enough hours');
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
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findFirst.mockImplementation(R(null));
      mockModel.compOffCredit.findMany.mockImplementation(() => [
        { id: 'c1', employeeId: EMP_PROFILE.id, status: 'APPROVED', remainingAmount: 2, expiresAt: null },
      ]);
      mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 10 } }));
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

      await expect(CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-05-03' })).rejects.toThrow();
      expect(mockModel.attendance.findUnique).toHaveBeenCalled();
    });

    test('future dates are rejected', async () => {
      setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
      mockModel.holiday.findMany.mockImplementation(R([]));
      setNoAttendance(); setNoCredit(); setCreditCount(0);

      // Use a future Saturday to avoid the weekday check in checkEligibility
      const futureSat = new Date();
      const daysUntilSat = (6 - futureSat.getDay() + 7) % 7 || 7;
      futureSat.setDate(futureSat.getDate() + daysUntilSat + 7);
      const satStr = futureSat.toISOString().split('T')[0];

      await expect(CompOffService.requestCredit(EMP_USER, { sourceDate: satStr })).rejects.toThrow('Cannot request');
    });
  });

  // ======== 22. Overlap prevention ========

  describe('22. Overlap prevention', () => {
    test('redeemCredit rejects overlapping Comp-Off leaves', async () => {
      mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
      mockModel.compOffLeave.findFirst.mockImplementation(R({
        id: 'lv1', employeeId: EMP_PROFILE.id, status: 'PENDING',
        startDate: new Date('2025-05-05'), endDate: new Date('2025-05-07'),
      }));

      await expect(CompOffService.redeemCredit(EMP_USER, { startDate: '2025-05-06', endDate: '2025-05-08' }))
        .rejects.toThrow('overlapping');
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
    mockModel.compOffPolicy.update.mockImplementation(R({ ...POLICY, minWorkingMinutes: 600 }));
    mockModel.auditLog.create.mockImplementation(R({}));

    await CompOffService.updatePolicy(HR_USER, { minWorkingMinutes: 600 });
    expect(mockModel.compOffPolicy.update).toHaveBeenCalled();
    expect(mockModel.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'UPDATE_COMPOFF_POLICY' }) })
    );
  });

  test('reviewCredit REJECT requires reason', async () => {
    mockModel.compOffCredit.findUnique.mockImplementation(R({
      id: 'c1', employeeId: 'emp-credit', status: 'PENDING',
      sourceDate: SAT, credits: 1, remainingAmount: 1,
    }));
    mockModel.employeeProfile.findUnique.mockImplementation(R({ id: 'emp-reviewer', userId: HR_USER.id }));

    await expect(CompOffService.reviewCredit(HR_USER, 'c1', 'REJECT', '')).rejects.toThrow('A rejection reason is required');
  });
});

// ============================================================
// CREDIT REVIEW TESTS
// ============================================================

describe('CompOffService — Credit Review', () => {
  beforeEach(() => { clearAll(); });

  test('reviewCredit rejects non-PENDING credits', async () => {
    mockModel.compOffCredit.findUnique.mockImplementation(R({
      id: 'c1', employeeId: 'emp-1', status: 'APPROVED',
      sourceDate: SAT, credits: 1, remainingAmount: 1,
    }));
    mockModel.employeeProfile.findUnique.mockImplementation(R({ id: 'emp-1', userId: 'user-other' }));

    await expect(CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null)).rejects.toThrow('already approved');
  });

  test('APPROVE updates status', async () => {
    mockModel.compOffCredit.findUnique.mockImplementation(R({
      id: 'c1', employeeId: 'emp-credit-other', status: 'PENDING',
      sourceDate: SAT, credits: 1, remainingAmount: 1,
    }));
    mockModel.employeeProfile.findUnique.mockImplementation(R({ id: 'emp-reviewer', userId: HR_USER.id }));
    mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 0 } }));
    mockModel.compOffCredit.update.mockImplementation(R({ id: 'c1', status: 'APPROVED' }));
    mockModel.compOffLedger.create.mockImplementation(R({ id: 'ledger-1' }));
    mockModel.auditLog.create.mockImplementation(R({}));

    await CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null);
    expect(mockModel.compOffCredit.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: expect.objectContaining({ status: 'APPROVED' }) })
    );
  });

  test('REJECT sets rejection reason', async () => {
    mockModel.compOffCredit.findUnique.mockImplementation(R({
      id: 'c1', employeeId: 'emp-credit-other', status: 'PENDING',
      sourceDate: SAT, credits: 1, remainingAmount: 1,
    }));
    mockModel.employeeProfile.findUnique.mockImplementation(R({ id: 'emp-reviewer', userId: HR_USER.id }));
    mockModel.compOffLedger.aggregate.mockImplementation(R({ _sum: { amount: 0 } }));
    mockModel.compOffCredit.update.mockImplementation(R({ id: 'c1', status: 'REJECTED' }));
    mockModel.compOffLedger.create.mockImplementation(R({ id: 'ledger-1' }));
    mockModel.auditLog.create.mockImplementation(R({}));

    await CompOffService.reviewCredit(HR_USER, 'c1', 'REJECT', 'Not enough hours');
    expect(mockModel.compOffCredit.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rejectionReason: 'Not enough hours' }) })
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
    mockModel.compOffCredit.findMany.mockImplementation(() => [
      { id: 'c1', employeeId: 'emp-1', status: 'APPROVED', remainingAmount: 2, expiresAt: new Date('2025-01-01') },
    ]);
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
    mockModel.compOffCredit.findMany.mockImplementation(R([
      { id: 'c1', sourceDate: SAT, credits: 1, remainingAmount: 1, status: 'APPROVED',
        expiresAt: null, approvedBy: 'user-hr', approvedAt: new Date(), rejectionReason: null, createdAt: new Date() },
    ]));

    const credits = await CompOffService.getMyCredits(EMP_USER);
    expect(credits).toHaveLength(1);
    expect(credits[0].status).toBe('APPROVED');
  });

  test('getCreditDetail includes attendance info', async () => {
    mockModel.compOffCredit.findUnique.mockImplementation(R({
      id: 'c1', employeeId: EMP_PROFILE.id, sourceDate: SAT,
      credits: 1, remainingAmount: 1, status: 'APPROVED', expiresAt: null,
      approvedBy: 'user-hr', approvedAt: new Date(), rejectionReason: null, createdAt: new Date(),
      employee: {
        id: EMP_PROFILE.id,
        userId: EMP_USER.id,
        firstName: EMP_PROFILE.firstName,
        lastName: EMP_PROFILE.lastName,
        employeeCode: EMP_PROFILE.employeeCode,
        user: { email: 'emp@ews.com' },
        department: { name: 'Engineering' },
        designation: { name: 'Developer' },
      },
      attendanceId: 'att-1',
    }));
    mockModel.attendance.findUnique.mockImplementation(R({
      id: 'att-1', date: SAT, workMode: 'OFFICE',
      status: 'PRESENT', totalMinutes: 480,
      sessions: [{ punchIn: new Date(), punchOut: new Date(), durationMinutes: 480 }],
    }));
    mockModel.compOffLedger.findMany.mockImplementation(R([]));

    const detail = await CompOffService.getCreditDetail(EMP_USER, 'c1');
    expect(detail.attendance).toBeDefined();
    expect(detail.attendance.totalMinutes).toBe(480);
  });
});

// ============================================================
// HR VIEW TESTS
// ============================================================

describe('CompOffService — HR Views', () => {
  beforeEach(() => { clearAll(); });

  test('getPendingRequests returns PENDING credits with employee info', async () => {
    mockModel.compOffCredit.findMany.mockImplementation(R([
      {
        id: 'c1', employeeId: EMP_PROFILE.id, sourceDate: SAT,
        credits: 1, remainingAmount: 1, status: 'PENDING',
        attendanceId: 'att-1', createdAt: new Date(),
        employee: {
          ...EMP_PROFILE,
          user: { email: 'emp@ews.com' },
          department: { name: 'Engineering' },
          designation: { name: 'Developer' },
        },
      },
    ]));

    const pending = await CompOffService.getPendingRequests(HR_USER);
    expect(pending).toHaveLength(1);
    expect(pending[0].employeeName).toBe('Rahul Sharma');
    expect(pending[0].departmentName).toBe('Engineering');
  });

  test('getEmployeeBalance computes correct balance', async () => {
    mockModel.employeeProfile.findUnique.mockImplementation(R(EMP_PROFILE));
    mockModel.compOffLedger.aggregate.mockImplementation(({ where }) => {
      const t = where.type;
      return Promise.resolve({ _sum: { amount: { EARNED: 10, USED: 3, EXPIRED: 1 }[t] || 0 } });
    });
    mockModel.compOffCredit.count.mockImplementation(() => Promise.resolve(1));

    const balance = await CompOffService.getEmployeeBalance(HR_USER, EMP_PROFILE.id);
    expect(balance.availableBalance).toBe(6);
    expect(balance.totalEarned).toBe(10);
    expect(balance.pendingCredits).toBe(1);
  });

  test('getAllCredits supports filtering', async () => {
    mockModel.compOffCredit.findMany.mockImplementation(R([]));
    mockModel.compOffCredit.count.mockImplementation(() => Promise.resolve(0));

    await CompOffService.getAllCredits(HR_USER, { page: 1, status: 'APPROVED', employeeId: EMP_PROFILE.id });
    expect(mockModel.compOffCredit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED', employeeId: EMP_PROFILE.id } })
    );
  });
});

// ============================================================
// EDGE CASES
// ============================================================

describe('CompOffService — Edge Cases', () => {
  beforeEach(() => { clearAll(); });

  test('monthly credit limit enforced', async () => {
    setPolicy(); setEmployee(EMP_USER, EMP_PROFILE);
    mockModel.holiday.findMany.mockImplementation(R([]));
    setAttendance(EMP_PROFILE.id, SAT);
    setNoCredit(); setCreditCount(4);

    await expect(CompOffService.requestCredit(EMP_USER, { sourceDate: '2025-05-03' })).rejects.toThrow('Maximum 4');
  });

  test('disabled policy blocks operations', async () => {
    mockModel.compOffPolicy.findFirst.mockImplementation(R({ ...POLICY, isEnabled: false }));
    setEmployee(EMP_USER, EMP_PROFILE);
    mockModel.attendance.findMany.mockImplementation(R([]));
    mockModel.holiday.findMany.mockImplementation(R([]));

    await expect(CompOffService.getEligibleDates(EMP_USER, { month: 5, year: 2025 })).rejects.toThrow('disabled');
  });
});

// ============================================================
// PRIVILEGE ESCALATION PREVENTION
// ============================================================

describe('CompOffService — Privilege Escalation', () => {
  beforeEach(() => { clearAll(); });

  test('HR cannot approve own credit', async () => {
    mockModel.compOffCredit.findUnique.mockImplementation(R({
      id: 'c1', employeeId: HR_PROFILE.id, status: 'PENDING',
      sourceDate: SAT, credits: 1, remainingAmount: 1,
    }));
    mockModel.employeeProfile.findUnique.mockImplementation(R(HR_PROFILE));

    await expect(CompOffService.reviewCredit(HR_USER, 'c1', 'APPROVE', null)).rejects.toThrow('cannot approve your own');
  });

  test('Admin cannot approve own credit', async () => {
    const adminProfile = { id: 'admin-1', userId: 'user-admin', firstName: 'Admin', lastName: 'User', status: 'ACTIVE' };
    mockModel.compOffCredit.findUnique.mockImplementation(R({
      id: 'c1', employeeId: adminProfile.id, status: 'PENDING',
      sourceDate: SAT, credits: 1, remainingAmount: 1,
    }));
    mockModel.employeeProfile.findUnique.mockImplementation(R(adminProfile));

    await expect(CompOffService.reviewCredit(ADMIN_USER, 'c1', 'APPROVE', null)).rejects.toThrow('cannot approve your own');
  });

  test('HR can update policy (canAccessAll)', async () => {
    setPolicy();
    mockModel.compOffPolicy.update.mockImplementation(R({ ...POLICY, minWorkingMinutes: 600 }));
    mockModel.auditLog.create.mockImplementation(R({}));

    await CompOffService.updatePolicy(HR_USER, { minWorkingMinutes: 600 });
    expect(mockModel.compOffPolicy.update).toHaveBeenCalled();
    expect(mockModel.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'UPDATE_COMPOFF_POLICY' }) })
    );
  });

  test('Employee cannot process expiry', async () => {
    await expect(CompOffService.processExpiredCredits(EMP_USER)).rejects.toThrow();
  });
});
