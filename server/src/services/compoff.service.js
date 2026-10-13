const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');
const {
  getTodayIST,
  toISTDate,
  isWeekend,
  isHoliday,
  formatDateKey,
  canAccessAll,
} = require('../utils/date-utils');

const PAGE_SIZE = 20;

let prismaInstance;
function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

// ---- Policy helpers ----

function getDefaultPolicy() {
  return {
    isEnabled: true,
    creditExpiryMonths: 6,
    minWorkingMinutes: 480,
    maxCreditsPerMonth: 4,
    applicableOnWeekends: true,
    applicableOnHolidays: true,
  };
}

async function getActivePolicy() {
  const prismaClient = getPrisma();
  let policy = await prismaClient.compOffPolicy.findFirst();
  if (!policy) {
    policy = await prismaClient.compOffPolicy.create({
      data: getDefaultPolicy(),
    });
  }
  return policy;
}

// ---- Date classification ----

function classifyDate(date, policy, holidayDateSet) {
  if (isHoliday(date, holidayDateSet)) {
    return { type: 'HOLIDAY', label: 'Holiday', eligible: policy.applicableOnHolidays };
  }
  if (isWeekend(date)) {
    return { type: 'WEEKEND', label: 'Weekend', eligible: policy.applicableOnWeekends };
  }
  return { type: 'WEEKDAY', label: 'Weekday', eligible: false };
}

// ---- Eligibility check ----

async function checkEligibility(employeeId, date, policy, holidayDateSet) {
  const prismaClient = getPrisma();
  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);

  const classification = classifyDate(dateStart, policy, holidayDateSet);
  if (!classification.eligible) {
    return {
      eligible: false,
      reason: `Comp-Off is not applicable for ${classification.label.toLowerCase()}s.`,
      dateType: classification.type,
      dateLabel: classification.label,
    };
  }

  const attendance = await prismaClient.attendance.findUnique({
    where: {
      employeeId_date: { employeeId, date: dateStart },
    },
    include: {
      sessions: true,
      corrections: {
        where: { status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!attendance) {
    return {
      eligible: false,
      reason: 'No attendance record found for this date.',
      dateType: classification.type,
      dateLabel: classification.label,
    };
  }

  const hasApprovedCorrection = attendance.corrections.length > 0;
  const effectiveStatus = hasApprovedCorrection
    ? (attendance.corrections[0].correctedStatus || attendance.status)
    : attendance.status;

  if (!['PRESENT', 'PARTIAL'].includes(effectiveStatus)) {
    return {
      eligible: false,
      reason: `Attendance status is "${effectiveStatus}", not eligible for Comp-Off.`,
      dateType: classification.type,
      dateLabel: classification.label,
    };
  }

  const completedSessions = attendance.sessions.filter((s) => s.punchOut !== null);
  if (completedSessions.length === 0) {
    return {
      eligible: false,
      reason: 'No completed work sessions found. Both punch-in and punch-out are required.',
      dateType: classification.type,
      dateLabel: classification.label,
    };
  }

  const totalMinutes = attendance.totalMinutes || 0;
  const minMinutes = policy.minWorkingMinutes || 480;
  if (totalMinutes < minMinutes) {
    return {
      eligible: false,
      reason: `Total work time (${totalMinutes} min) is below the minimum required (${minMinutes} min).`,
      dateType: classification.type,
      dateLabel: classification.label,
      totalMinutes,
      minMinutes,
    };
  }

  const existingCredit = await prismaClient.compOffCredit.findUnique({
    where: {
      compOff_employee_date: { employeeId, sourceDate: dateStart },
    },
  });

  if (existingCredit) {
    return {
      eligible: false,
      reason: `A Comp-Off credit request already exists for this date (${existingCredit.status}).`,
      dateType: classification.type,
      dateLabel: classification.label,
      existingStatus: existingCredit.status,
    };
  }

  return {
    eligible: true,
    reason: 'Eligible for Comp-Off credit.',
    dateType: classification.type,
    dateLabel: classification.label,
    totalMinutes,
    hasApprovedCorrection,
  };
}

class CompOffService {
  // ---- Policy ----

  static async getPolicy() {
    return getActivePolicy();
  }

  static async updatePolicy(reqUser, data) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update Comp-Off policy.', 403);
    }

    const prismaClient = getPrisma();
    const existing = await prismaClient.compOffPolicy.findFirst();

    const updateData = {
      isEnabled: data.isEnabled ?? existing?.isEnabled ?? true,
      creditExpiryMonths: data.creditExpiryMonths ?? existing?.creditExpiryMonths ?? 6,
      minWorkingMinutes: data.minWorkingMinutes ?? existing?.minWorkingMinutes ?? 480,
      maxCreditsPerMonth: data.maxCreditsPerMonth ?? existing?.maxCreditsPerMonth ?? 4,
      applicableOnWeekends: data.applicableOnWeekends ?? existing?.applicableOnWeekends ?? true,
      applicableOnHolidays: data.applicableOnHolidays ?? existing?.applicableOnHolidays ?? true,
    };

    let updated;
    if (existing) {
      updated = await prismaClient.compOffPolicy.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      updated = await prismaClient.compOffPolicy.create({
        data: updateData,
      });
    }

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'UPDATE_COMPOFF_POLICY',
        entityType: 'CompOffPolicy',
        entityId: updated.id,
        metadata: JSON.stringify(updateData),
      },
    });

    logger.info('Comp-Off policy updated', { actorId: reqUser.id, policyId: updated.id });
    return updated;
  }

  // ---- Employee: Eligible Dates ----

  static async getEligibleDates(reqUser, { month, year }) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const policy = await getActivePolicy();
    if (!policy.isEnabled) {
      throw new AppError(AppErrorCodes.POLICY_DISABLED, 'Comp-Off is currently disabled.', 400);
    }

    const targetMonth = month || getTodayIST().getMonth() + 1;
    const targetYear = year || getTodayIST().getFullYear();
    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    const holidays = await prismaClient.holiday.findMany({
      where: {
        date: { gte: monthStart, lte: monthEnd },
        isActive: true,
      },
      select: { date: true },
    });
    const holidayDateSet = new Set(holidays.map((h) => formatDateKey(h.date)));

    const attendances = await prismaClient.attendance.findMany({
      where: { employeeId: profile.id, date: { gte: monthStart, lte: monthEnd } },
      include: {
        sessions: true,
        corrections: {
          where: { status: 'APPROVED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { date: 'desc' },
    });

    const results = [];
    for (const attendance of attendances) {
      const eligibility = await checkEligibility(profile.id, attendance.date, policy, holidayDateSet);
      results.push({
        date: attendance.date,
        dateKey: formatDateKey(attendance.date),
        ...eligibility,
        attendanceId: attendance.id,
        status: attendance.status,
        totalMinutes: attendance.totalMinutes || 0,
      });
    }

    return results;
  }

  // ---- Employee: Request Credit ----

  static async requestCredit(reqUser, { sourceDate, attendanceId }) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const policy = await getActivePolicy();
    if (!policy.isEnabled) {
      throw new AppError(AppErrorCodes.POLICY_DISABLED, 'Comp-Off is currently disabled.', 400);
    }

    const dateObj = toISTDate(sourceDate);
    const today = getTodayIST();
    today.setHours(0, 0, 0, 0);

    if (dateObj > today) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Cannot request Comp-Off for a future date.', 400);
    }

    const holidays = await prismaClient.holiday.findMany({
      where: { isActive: true },
      select: { date: true },
    });
    const holidayDateSet = new Set(holidays.map((h) => formatDateKey(h.date)));

    const eligibility = await checkEligibility(profile.id, dateObj, policy, holidayDateSet);
    if (!eligibility.eligible) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, eligibility.reason, 400);
    }

    // Check monthly limit
    const monthStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
    const monthEnd = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0, 23, 59, 59, 999);
    const creditsThisMonth = await prismaClient.compOffCredit.count({
      where: {
        employeeId: profile.id,
        createdAt: { gte: monthStart, lte: monthEnd },
      },
    });

    const maxPerMonth = policy.maxCreditsPerMonth || 4;
    if (creditsThisMonth >= maxPerMonth) {
      throw new AppError(
        AppErrorCodes.CONFLICT,
        `Maximum ${maxPerMonth} Comp-Off credits allowed per month.`,
        409
      );
    }

    const expiryMonths = policy.creditExpiryMonths || 6;
    const expiresAt = new Date(dateObj.getFullYear(), dateObj.getMonth() + expiryMonths, 0, 23, 59, 59);

    const attendance = await prismaClient.attendance.findUnique({
      where: { employeeId_date: { employeeId: profile.id, date: dateObj } },
      select: { id: true },
    });

    const credit = await prismaClient.compOffCredit.create({
      data: {
        employeeId: profile.id,
        sourceDate: dateObj,
        attendanceId: attendance?.id || attendanceId || null,
        credits: 1,
        remainingAmount: 1,
        status: 'PENDING',
        expiresAt,
      },
    });

    const totalBalance = await prismaClient.compOffLedger.aggregate({
      where: { employeeId: profile.id },
      _sum: { amount: true },
    });

    const balanceBefore = Number(totalBalance._sum.amount || 0);

    await prismaClient.compOffLedger.create({
      data: {
        employeeId: profile.id,
        creditId: credit.id,
        type: 'EARNED',
        amount: 0,
        balanceBefore,
        balanceAfter: balanceBefore,
        reason: `Credit requested for ${formatDateKey(dateObj)} (${eligibility.dateType}) — pending approval.`,
        createdBy: reqUser.id,
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'CREATE_COMPOFF_REQUEST',
        entityType: 'CompOffCredit',
        entityId: credit.id,
        metadata: JSON.stringify({ sourceDate: formatDateKey(dateObj), dateType: eligibility.dateType }),
      },
    });

    logger.info('Comp-Off credit requested', { creditId: credit.id, employeeId: profile.id, date: sourceDate });
    return credit;
  }

  // ---- HR: Approve / Reject Credit ----

  static async reviewCredit(reqUser, creditId, action, reason) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to review Comp-Off credit requests.', 403);
    }

    const prismaClient = getPrisma();

    const credit = await prismaClient.compOffCredit.findUnique({
      where: { id: creditId },
    });

    if (!credit) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Comp-Off credit not found.', 404);
    }

    if (credit.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Credit is already ${credit.status.toLowerCase()}.`, 409);
    }

    const reviewerProfile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });

    if (reviewerProfile && credit.employeeId === reviewerProfile.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot approve your own Comp-Off credit request.', 403);
    }

    const now = new Date();

    const result = await prismaClient.$transaction(async (tx) => {
      let updated;

      if (action === 'APPROVE') {
        updated = await tx.compOffCredit.update({
          where: { id: creditId },
          data: {
            status: 'APPROVED',
            approvedBy: reqUser.id,
            approvedAt: now,
          },
        });

        const total = await tx.compOffLedger.aggregate({
          where: { employeeId: credit.employeeId, type: 'EARNED' },
          _sum: { amount: true },
        });

        const balanceBefore = Number(total._sum.amount || 0);

        await tx.compOffLedger.create({
          data: {
            employeeId: credit.employeeId,
            creditId: credit.id,
            type: 'EARNED',
            amount: Number(credit.credits),
            balanceBefore,
            balanceAfter: balanceBefore + Number(credit.credits),
            reason: `Credit approved for ${formatDateKey(credit.sourceDate)}.`,
            createdBy: reqUser.id,
          },
        });
      } else {
        if (!reason || !reason.trim()) {
          throw new AppError(AppErrorCodes.INVALID_INPUT, 'A rejection reason is required.', 400);
        }

        updated = await tx.compOffCredit.update({
          where: { id: creditId },
          data: {
            status: 'REJECTED',
            rejectionReason: reason,
          },
        });

        const total = await tx.compOffLedger.aggregate({
          where: { employeeId: credit.employeeId },
          _sum: { amount: true },
        });

        const balanceBefore = Number(total._sum.amount || 0);

        await tx.compOffLedger.create({
          data: {
            employeeId: credit.employeeId,
            creditId: credit.id,
            type: 'RELEASED',
            amount: 0,
            balanceBefore,
            balanceAfter: balanceBefore,
            reason: `Credit rejected for ${formatDateKey(credit.sourceDate)}: ${reason}`,
            createdBy: reqUser.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: action === 'APPROVE' ? 'APPROVE_COMPOFF_CREDIT' : 'REJECT_COMPOFF_CREDIT',
          entityType: 'CompOffCredit',
          entityId: creditId,
          metadata: JSON.stringify({
            employeeId: credit.employeeId,
            sourceDate: formatDateKey(credit.sourceDate),
            reason: action === 'REJECT' ? reason : undefined,
          }),
        },
      });

      return updated;
    });

    logger.info(`Comp-Off credit ${action.toLowerCase()}ed`, { creditId, reviewerId: reqUser.id });
    return result;
  }

  // ---- Balance ----

  static async getMyBalance(reqUser) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const [earned, used, expired, released, pendingCredits] = await Promise.all([
      prismaClient.compOffLedger.aggregate({ where: { employeeId: profile.id, type: 'EARNED' }, _sum: { amount: true } }),
      prismaClient.compOffLedger.aggregate({ where: { employeeId: profile.id, type: 'USED' }, _sum: { amount: true } }),
      prismaClient.compOffLedger.aggregate({ where: { employeeId: profile.id, type: 'EXPIRED' }, _sum: { amount: true } }),
      prismaClient.compOffLedger.aggregate({ where: { employeeId: profile.id, type: 'RELEASED' }, _sum: { amount: true } }),
      prismaClient.compOffCredit.count({ where: { employeeId: profile.id, status: 'PENDING' } }),
    ]);

    const totalEarned = Number(earned._sum.amount || 0);
    const totalUsed = Number(used._sum.amount || 0);
    const totalExpired = Number(expired._sum.amount || 0);

    return {
      totalEarned,
      totalUsed,
      totalExpired,
      totalReleased: Number(released._sum.amount || 0),
      availableBalance: Math.max(0, totalEarned - totalUsed - totalExpired),
      pendingCredits,
    };
  }

  // ---- Ledger ----

  static async getMyLedger(reqUser, { page = 1 } = {}) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const skip = (page - 1) * PAGE_SIZE;

    const [entries, total] = await Promise.all([
      prismaClient.compOffLedger.findMany({
        where: { employeeId: profile.id },
        skip,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
      }),
      prismaClient.compOffLedger.count({ where: { employeeId: profile.id } }),
    ]);

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amount: Number(e.amount),
        balanceBefore: Number(e.balanceBefore),
        balanceAfter: Number(e.balanceAfter),
        reason: e.reason,
        creditId: e.creditId,
        relatedLeaveId: e.relatedLeaveId,
        createdAt: e.createdAt,
      })),
      pagination: { page, pageSize: PAGE_SIZE, total, pages },
    };
  }

  // ---- Credit History ----

  static async getMyCredits(reqUser) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const credits = await prismaClient.compOffCredit.findMany({
      where: { employeeId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return credits.map((c) => ({
      id: c.id,
      sourceDate: c.sourceDate,
      credits: Number(c.credits),
      remainingAmount: Number(c.remainingAmount),
      status: c.status,
      expiresAt: c.expiresAt,
      approvedBy: c.approvedBy,
      approvedAt: c.approvedAt,
      rejectionReason: c.rejectionReason,
      createdAt: c.createdAt,
    }));
  }

  // ---- HR: Pending Requests ----

  static async getPendingRequests(reqUser) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to review Comp-Off requests.', 403);
    }

    const prismaClient = getPrisma();
    const requests = await prismaClient.compOffCredit.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        employee: {
          include: {
            user: { select: { email: true } },
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
      },
    });

    return requests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
      employeeCode: r.employee.employeeCode,
      employeeEmail: r.employee.user.email,
      departmentName: r.employee.department?.name || '',
      designationName: r.employee.designation?.name || '',
      sourceDate: r.sourceDate,
      credits: Number(r.credits),
      status: r.status,
      attendanceId: r.attendanceId,
      createdAt: r.createdAt,
    }));
  }

  // ---- HR: Employee Balance ----

  static async getEmployeeBalance(reqUser, employeeId) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view employee Comp-Off balances.', 403);
    }

    const prismaClient = getPrisma();
    const target = await prismaClient.employeeProfile.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });

    if (!target) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    const [earned, used, expired, pendingCredits] = await Promise.all([
      prismaClient.compOffLedger.aggregate({ where: { employeeId, type: 'EARNED' }, _sum: { amount: true } }),
      prismaClient.compOffLedger.aggregate({ where: { employeeId, type: 'USED' }, _sum: { amount: true } }),
      prismaClient.compOffLedger.aggregate({ where: { employeeId, type: 'EXPIRED' }, _sum: { amount: true } }),
      prismaClient.compOffCredit.count({ where: { employeeId, status: 'PENDING' } }),
    ]);

    return {
      employeeId: target.id,
      employeeCode: target.employeeCode,
      employeeName: `${target.firstName} ${target.lastName}`,
      totalEarned: Number(earned._sum.amount || 0),
      totalUsed: Number(used._sum.amount || 0),
      totalExpired: Number(expired._sum.amount || 0),
      availableBalance: Math.max(0, Number(earned._sum.amount || 0) - Number(used._sum.amount || 0) - Number(expired._sum.amount || 0)),
      pendingCredits,
    };
  }

  // ---- HR: All Credits ----

  static async getAllCredits(reqUser, { page = 1, status, employeeId } = {}) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view Comp-Off credits.', 403);
    }

    const prismaClient = getPrisma();
    const where = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const skip = (page - 1) * PAGE_SIZE;

    const [credits, total] = await Promise.all([
      prismaClient.compOffCredit.findMany({
        where,
        skip,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            include: {
              user: { select: { email: true } },
              department: { select: { name: true } },
            },
          },
        },
      }),
      prismaClient.compOffCredit.count({ where }),
    ]);

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      credits: credits.map((c) => ({
        id: c.id,
        employeeId: c.employeeId,
        employeeName: `${c.employee.firstName} ${c.employee.lastName}`,
        employeeCode: c.employee.employeeCode,
        employeeEmail: c.employee.user.email,
        departmentName: c.employee.department?.name || '',
        sourceDate: c.sourceDate,
        credits: Number(c.credits),
        remainingAmount: Number(c.remainingAmount),
        status: c.status,
        expiresAt: c.expiresAt,
        approvedBy: c.approvedBy,
        approvedAt: c.approvedAt,
        rejectionReason: c.rejectionReason,
        createdAt: c.createdAt,
      })),
      pagination: { page, pageSize: PAGE_SIZE, total, pages },
    };
  }

  // ---- Credit Detail ----

  static async getCreditDetail(reqUser, creditId) {
    const prismaClient = getPrisma();
    const credit = await prismaClient.compOffCredit.findUnique({
      where: { id: creditId },
      include: {
        employee: {
          include: {
            user: { select: { email: true } },
            department: { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
      },
    });

    if (!credit) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Comp-Off credit not found.', 404);
    }

    const isSelf = reqUser.id === credit.employee.userId;
    if (!isSelf && !canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view this credit.', 403);
    }

    const ledgerEntries = await prismaClient.compOffLedger.findMany({
      where: { creditId },
      orderBy: { createdAt: 'desc' },
    });

    let attendanceInfo = null;
    if (credit.attendanceId) {
      const attendance = await prismaClient.attendance.findUnique({
        where: { id: credit.attendanceId },
        select: {
          id: true,
          date: true,
          workMode: true,
          status: true,
          totalMinutes: true,
          sessions: {
            select: {
              punchIn: true,
              punchOut: true,
              durationMinutes: true,
            },
          },
        },
      });
      attendanceInfo = attendance;
    }

    return {
      id: credit.id,
      employeeId: credit.employeeId,
      employeeName: `${credit.employee.firstName} ${credit.employee.lastName}`,
      employeeCode: credit.employee.employeeCode,
      employeeEmail: credit.employee.user.email,
      departmentName: credit.employee.department?.name || '',
      designationName: credit.employee.designation?.name || '',
      sourceDate: credit.sourceDate,
      credits: Number(credit.credits),
      remainingAmount: Number(credit.remainingAmount),
      status: credit.status,
      expiresAt: credit.expiresAt,
      approvedBy: credit.approvedBy,
      approvedAt: credit.approvedAt,
      rejectionReason: credit.rejectionReason,
      attendanceId: credit.attendanceId,
      attendance: attendanceInfo,
      ledgerEntries: ledgerEntries.map((l) => ({
        id: l.id,
        type: l.type,
        amount: Number(l.amount),
        balanceBefore: Number(l.balanceBefore),
        balanceAfter: Number(l.balanceAfter),
        reason: l.reason,
        createdAt: l.createdAt,
      })),
      createdAt: credit.createdAt,
    };
  }

  // ---- Expiry Processing ----

  static async processExpiredCredits(reqUser) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to process expired credits.', 403);
    }

    const prismaClient = getPrisma();
    const now = new Date();

    const expiredCredits = await prismaClient.compOffCredit.findMany({
      where: {
        status: 'APPROVED',
        expiresAt: { lte: now },
        remainingAmount: { gt: 0 },
      },
    });

    if (expiredCredits.length === 0) {
      return { processed: 0 };
    }

    let processed = 0;

    for (const credit of expiredCredits) {
      await prismaClient.$transaction(async (tx) => {
        const remaining = Number(credit.remainingAmount);

        await tx.compOffCredit.update({
          where: { id: credit.id },
          data: { status: 'EXPIRED' },
        });

        const total = await tx.compOffLedger.aggregate({
          where: { employeeId: credit.employeeId },
          _sum: { amount: true },
        });

        const balanceBefore = Number(total._sum.amount || 0);

        await tx.compOffLedger.create({
          data: {
            employeeId: credit.employeeId,
            creditId: credit.id,
            type: 'EXPIRED',
            amount: remaining,
            balanceBefore,
            balanceAfter: balanceBefore - remaining,
            reason: `Credit expired on ${formatDateKey(credit.expiresAt)}.`,
            createdBy: reqUser.id,
          },
        });

        processed++;
      });
    }

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'PROCESS_COMPOFF_EXPIRY',
        entityType: 'CompOffCredit',
        entityId: 'batch',
        metadata: JSON.stringify({ processedCount: processed }),
      },
    });

    logger.info('Expired Comp-Off credits processed', { processed, actorId: reqUser.id });
    return { processed };
  }

  // ---- Redeem Credit (Apply Comp-Off as Leave) ----

  static async redeemCredit(reqUser, { startDate, endDate, isHalfDay, halfDayPeriod, reason }) {
    const prismaClient = getPrisma();

    // 1. Resolve employee
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true, status: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }
    if (profile.status !== 'ACTIVE') {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Inactive employees cannot apply for Comp-Off.', 400);
    }

    // 2. Validate dates
    const start = toISTDate(startDate);
    const end = toISTDate(endDate);

    if (start > end) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Start date cannot be after end date.', 400);
    }

    // 3. Check overlapping Comp-Off leave requests
    const overlapping = await prismaClient.compOffLeave.findFirst({
      where: {
        employeeId: profile.id,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
    });
    if (overlapping) {
      throw new AppError(AppErrorCodes.LEAVE_OVERLAP, 'You already have a Comp-Off request overlapping with these dates.', 409);
    }

    // 4. Calculate required credits
    const daysCount = countDaysBetween(start, end);
    const requiredCredits = isHalfDay ? daysCount * 0.5 : daysCount;

    if (requiredCredits <= 0) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'Selected dates contain no valid days.', 400);
    }

    // 5. Atomically check balance, deduct credits, create Comp-Off leave request
    const now = new Date();
    const result = await prismaClient.$transaction(async (tx) => {
      // Create the Comp-Off leave first (before deducting credits, so we have the ID for ledger entries)
      const compOffLeave = await tx.compOffLeave.create({
        data: {
          employeeId: profile.id,
          startDate: start,
          endDate: end,
          isHalfDay: isHalfDay || false,
          halfDayPeriod: halfDayPeriod || null,
          totalDays: requiredCredits,
          reason: reason || 'Comp-Off leave',
          status: 'PENDING',
        },
      });

      // Get all APPROVED, non-expired credits sorted by expiry (oldest first)
      const credits = await tx.compOffCredit.findMany({
        where: {
          employeeId: profile.id,
          status: 'APPROVED',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
        orderBy: { expiresAt: 'asc' },
      });

      // Calculate total available
      let totalAvailable = 0;
      for (const c of credits) {
        totalAvailable += Number(c.remainingAmount);
      }

      if (totalAvailable < requiredCredits) {
        throw new AppError(
          AppErrorCodes.INSUFFICIENT_CREDITS,
          `Insufficient Comp-Off balance. Available: ${totalAvailable.toFixed(2)} days, Required: ${requiredCredits.toFixed(2)} days.`,
          400
        );
      }

      // Deduct from credits FIFO
      let remainingToDeduct = requiredCredits;

      for (const credit of credits) {
        if (remainingToDeduct <= 0) break;

        const creditRemaining = Number(credit.remainingAmount);
        const deductAmount = Math.min(creditRemaining, remainingToDeduct);
        const newRemaining = creditRemaining - deductAmount;

        await tx.compOffCredit.update({
          where: { id: credit.id },
          data: {
            remainingAmount: newRemaining,
            status: newRemaining <= 0.0001 ? 'USED' : 'APPROVED',
          },
        });

        const ledgerTotal = await tx.compOffLedger.aggregate({
          where: { employeeId: profile.id },
          _sum: { amount: true },
        });

        const balanceBefore = Number(ledgerTotal._sum.amount || 0);

        await tx.compOffLedger.create({
          data: {
            employeeId: profile.id,
            creditId: credit.id,
            type: 'USED',
            amount: deductAmount,
            balanceBefore,
            balanceAfter: balanceBefore - deductAmount,
            reason: `Comp-Off leave: ${formatDateKey(start)} to ${formatDateKey(end)}${isHalfDay ? ' (half-day)' : ''}`,
            relatedLeaveId: compOffLeave.id,
            createdBy: reqUser.id,
          },
        });

        remainingToDeduct -= deductAmount;
      }

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'CREATE_COMPOFF_LEAVE',
          entityType: 'CompOffLeave',
          entityId: compOffLeave.id,
          metadata: JSON.stringify({
            totalDays: requiredCredits,
            startDate: formatDateKey(start),
            endDate: formatDateKey(end),
          }),
        },
      });

      return { compOffLeave };
    });

    logger.info('Comp-Off leave created', { leaveId: result.compOffLeave.id, employeeId: profile.id, days: requiredCredits });
    return {
      id: result.compOffLeave.id,
      startDate: result.compOffLeave.startDate,
      endDate: result.compOffLeave.endDate,
      isHalfDay: result.compOffLeave.isHalfDay,
      totalDays: Number(result.compOffLeave.totalDays),
      reason: result.compOffLeave.reason,
      status: result.compOffLeave.status,
      createdAt: result.compOffLeave.createdAt,
    };
  }

  // ---- HR: Approve/Reject Comp-Off Leave ----

  static async reviewCompOffLeave(reqUser, leaveId, action, reviewComment) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to review Comp-Off requests.', 403);
    }

    const prismaClient = getPrisma();

    const compOffLeave = await prismaClient.compOffLeave.findUnique({
      where: { id: leaveId },
    });
    if (!compOffLeave) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Comp-Off leave request not found.', 404);
    }

    if (compOffLeave.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Request is already ${compOffLeave.status.toLowerCase()}.`, 409);
    }

    const reviewerProfile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });

    if (reviewerProfile && compOffLeave.employeeId === reviewerProfile.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You cannot approve your own Comp-Off request.', 403);
    }

    if (action === 'REJECT' && (!reviewComment || !reviewComment.trim())) {
      throw new AppError(AppErrorCodes.INVALID_INPUT, 'A rejection reason is required.', 400);
    }

    const now = new Date();

    const result = await prismaClient.$transaction(async (tx) => {
      if (action === 'APPROVE') {
        await tx.compOffLeave.update({
          where: { id: leaveId },
          data: {
            status: 'APPROVED',
            reviewedBy: reqUser.id,
            reviewedAt: now,
            reviewComment: reviewComment || null,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: reqUser.id,
            actorRole: reqUser.role,
            action: 'APPROVE_COMPOFF_LEAVE',
            entityType: 'CompOffLeave',
            entityId: leaveId,
            metadata: JSON.stringify({ employeeId: compOffLeave.employeeId }),
          },
        });
      } else {
        // REJECTED: restore credits
        await tx.compOffLeave.update({
          where: { id: leaveId },
          data: {
            status: 'REJECTED',
            reviewedBy: reqUser.id,
            reviewedAt: now,
            reviewComment,
          },
        });

        // Find ledger entries for this leave and restore amounts
        const ledgerEntries = await tx.compOffLedger.findMany({
          where: { relatedLeaveId: leaveId, type: 'USED' },
          include: { credit: true },
        });

        for (const entry of ledgerEntries) {
          if (entry.creditId && entry.credit) {
            const restoreAmount = Number(entry.amount);
            const currentRemaining = Number(entry.credit.remainingAmount);
            const newRemaining = currentRemaining + restoreAmount;

            await tx.compOffCredit.update({
              where: { id: entry.creditId },
              data: {
                remainingAmount: newRemaining,
                status: newRemaining > 0.0001 ? 'APPROVED' : 'APPROVED',
              },
            });
          }
        }

        await tx.auditLog.create({
          data: {
            actorId: reqUser.id,
            actorRole: reqUser.role,
            action: 'REJECT_COMPOFF_LEAVE',
            entityType: 'CompOffLeave',
            entityId: leaveId,
            metadata: JSON.stringify({ employeeId: compOffLeave.employeeId, reason: reviewComment }),
          },
        });
      }

      return compOffLeave;
    });

    return result;
  }

  // ---- HR: List Pending Comp-Off Leaves ----

  static async getPendingCompOffLeaves(reqUser) {
    if (!canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to review Comp-Off requests.', 403);
    }

    const prismaClient = getPrisma();
    const leaves = await prismaClient.compOffLeave.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        employee: {
          include: {
            user: { select: { email: true } },
            department: { select: { name: true } },
          },
        },
      },
    });

    return leaves.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      employeeName: `${l.employee.firstName} ${l.employee.lastName}`,
      employeeCode: l.employee.employeeCode,
      employeeEmail: l.employee.user.email,
      departmentName: l.employee.department?.name || '',
      startDate: l.startDate,
      endDate: l.endDate,
      isHalfDay: l.isHalfDay,
      totalDays: Number(l.totalDays),
      reason: l.reason,
      status: l.status,
      createdAt: l.createdAt,
    }));
  }

  // ---- Employee: Cancel Comp-Off Leave ----

  static async cancelLeave(reqUser, leaveId) {
    const prismaClient = getPrisma();
    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const compOffLeave = await prismaClient.compOffLeave.findUnique({
      where: { id: leaveId },
    });
    if (!compOffLeave) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Comp-Off leave not found.', 404);
    }
    if (compOffLeave.employeeId !== profile.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only cancel your own requests.', 403);
    }
    if (compOffLeave.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Cannot cancel a ${compOffLeave.status.toLowerCase()} request.`, 409);
    }

    const result = await prismaClient.$transaction(async (tx) => {
      const updated = await tx.compOffLeave.update({
        where: { id: leaveId },
        data: { status: 'CANCELLED' },
      });

      // Restore credits that were deducted for this leave
      const ledgerEntries = await tx.compOffLedger.findMany({
        where: { relatedLeaveId: leaveId, type: 'USED' },
        include: { credit: true },
      });

      for (const entry of ledgerEntries) {
        if (entry.creditId && entry.credit) {
          const restoreAmount = Number(entry.amount);
          const currentRemaining = Number(entry.credit.remainingAmount);
          const newRemaining = currentRemaining + restoreAmount;

          await tx.compOffCredit.update({
            where: { id: entry.creditId },
            data: {
              remainingAmount: newRemaining,
              status: 'APPROVED',
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: reqUser.id,
          actorRole: reqUser.role,
          action: 'CANCEL_COMPOFF_LEAVE',
          entityType: 'CompOffLeave',
          entityId: leaveId,
        },
      });

      return updated;
    });

    return result;
  }
}

// ---- Utility ----

function countDaysBetween(startDate, endDate) {
  if (startDate > endDate) return 0;
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    count += 1;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

if (process.env.NODE_ENV === 'test') {
  CompOffService.__setPrisma = (m) => { prismaInstance = m; };
  CompOffService.__resetPrisma = () => { prismaInstance = undefined; };
}

// ---- Test helpers ----
CompOffService._checkEligibility = checkEligibility;
CompOffService._getDefaultPolicy = getDefaultPolicy;

module.exports = { CompOffService };

