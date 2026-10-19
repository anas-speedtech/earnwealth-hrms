const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');

let prismaInstance;

function getPrisma() {
  if (!prismaInstance) {
    const { PrismaClient } = require('@prisma/client');
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

class AttendanceCorrectionService {
  static async getById(reqUser, correctionId) {
    const prismaClient = getPrisma();
    const correction = await prismaClient.attendanceCorrection.findUnique({
      where: { id: parseInt(correctionId, 10) },
      include: {
        attendance: { select: { punchTime: true } },
      },
    });

    if (!correction) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Correction request not found.', 404);
    }

    // Employees can only view their own corrections
    const canViewAll = reqUser.role === Role.SUPER_ADMIN || reqUser.role === Role.HR_ADMIN;
    if (!canViewAll && correction.employeeId !== reqUser.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only view your own correction requests.', 403);
    }

    return correction;
  }

  static async listPending(reqUser) {
    // Only HR and above can see pending corrections
    const allowed = [Role.SUPER_ADMIN, Role.HR_ADMIN];
    if (!allowed.includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view correction requests.', 403);
    }

    const prismaClient = getPrisma();

    const corrections = await prismaClient.attendanceCorrection.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        attendance: { select: { punchTime: true } },
      },
    });

    // Get employee info for each correction
    const employeeIds = [...new Set(corrections.map((c) => c.employeeId))];
    const employees = await prismaClient.employeeProfile.findMany({
      where: { id: { in: employeeIds } },
      include: { user: { select: { email: true } } },
    });

    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    return corrections.map((c) => {
      const emp = employeeMap.get(c.employeeId);
      return {
        id: c.id,
        attendanceId: c.attendanceId,
        employeeId: c.employeeId,
        employeeName: `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || 'Unknown',
        employeeEmail: emp?.user?.email || '',
        employeeCode: emp?.employeeCode || '',
        date: c.attendance.punchTime ? String(c.attendance.punchTime).slice(0, 10) : null,
        originalPunchIn: c.originalPunchIn,
        originalPunchOut: c.originalPunchOut,
        originalStatus: c.originalStatus,
        correctedPunchIn: c.correctedPunchIn,
        correctedPunchOut: c.correctedPunchOut,
        correctedStatus: c.correctedStatus,
        reason: c.reason,
        status: c.status,
        createdAt: c.createdAt,
      };
    });
  }

  static async listMyCorrections(reqUser, { page = 1 }) {
    const prismaClient = getPrisma();
    const skip = (page - 1) * PAGE_SIZE;

    const [corrections, total] = await Promise.all([
      prismaClient.attendanceCorrection.findMany({
        where: { employeeId: reqUser.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        include: {
          attendance: { select: { id: true, punchTime: true } },
        },
      }),
      prismaClient.attendanceCorrection.count({ where: { employeeId: reqUser.id } }),
    ]);

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      corrections: corrections.map((c) => ({
        id: c.id,
        attendanceId: c.attendanceId,
        date: c.attendance.punchTime ? String(c.attendance.punchTime).slice(0, 10) : null,
        reason: c.reason,
        status: c.status,
        reviewComment: c.reviewComment,
        createdAt: c.createdAt,
      })),
      pagination: { page, pageSize: PAGE_SIZE, total, pages },
    };
  }

  static async create(reqUser, { attendanceId, correctedPunchIn, correctedPunchOut, correctedStatus, reason }) {
    const prismaClient = getPrisma();

    const profile = await prismaClient.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }

    const attendance = await prismaClient.attendanceLog.findUnique({
      where: { id: parseInt(attendanceId, 10) },
    });

    if (!attendance) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Attendance record not found.', 404);
    }

    if (attendance.employeeId !== profile.id) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only request corrections for your own attendance.', 403);
    }

    // Check for existing pending correction for this attendance
    const existingPending = await prismaClient.attendanceCorrection.findFirst({
      where: {
        attendanceId: parseInt(attendanceId, 10),
        employeeId: profile.id,
        status: 'PENDING',
      },
    });
    if (existingPending) {
      throw new AppError(AppErrorCodes.CONFLICT, 'A pending correction request already exists for this attendance record.', 409);
    }

    // Attendance logs only carry the punch-in time of the day, so that is the
    // original punch-in used for the correction. The punch-out of the current
    // session is not tracked by the deployed schema.
    const originalPunchIn = attendance.punchTime ? attendance.punchTime : null;
    const originalPunchOut = null;

    const correction = await prismaClient.attendanceCorrection.create({
      data: {
        attendanceId: parseInt(attendanceId, 10),
        employeeId: profile.id,
        originalPunchIn,
        originalPunchOut,
        originalStatus: attendance.status,
        correctedPunchIn: correctedPunchIn ? new Date(correctedPunchIn) : null,
        correctedPunchOut: correctedPunchOut ? new Date(correctedPunchOut) : null,
        correctedStatus: correctedStatus || attendance.status,
        reason,
        status: 'PENDING',
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'REQUEST_ATTENDANCE_CORRECTION',
        entityType: 'AttendanceCorrection',
        entityId: correction.id,
      },
    });

    logger.info('Attendance correction requested', { correctionId: correction.id, employeeId: profile.id });

    return correction;
  }

  static async approve(reqUser, correctionId, reviewComment) {
    const prismaClient = getPrisma();

    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only authorized staff can approve corrections.', 403);
    }

    const correction = await prismaClient.attendanceCorrection.findUnique({
      where: { id: parseInt(correctionId, 10) },
      include: {
        attendance: { select: { punchTime: true } },
      },
    });

    if (!correction) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Correction request not found.', 404);
    }

    if (correction.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Correction is already ${correction.status.toLowerCase()}.`, 409);
    }

    const now = new Date();

    // Update attendance with corrected values
    const updates = {
      status: correction.correctedStatus || correction.attendance.status,
    };

    // Update the attendance record with the corrected values
    await prismaClient.attendanceLog.update({
      where: { id: correction.attendanceId },
      data: updates,
    });

    // Mark correction as approved
    const updated = await prismaClient.attendanceCorrection.update({
      where: { id: parseInt(correctionId, 10) },
      data: {
        status: 'APPROVED',
        reviewedBy: reqUser.id,
        reviewedAt: now,
        reviewComment,
      },
    });

    // Add audit log
    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'APPROVE_ATTENDANCE_CORRECTION',
        entityType: 'AttendanceCorrection',
        entityId: correctionId,
        metadata: JSON.stringify({ employeeId: correction.employeeId, attendanceId: correction.attendanceId }),
      },
    });

    logger.info('Attendance correction approved', { correctionId, reviewerId: reqUser.id });

    return updated;
  }

  static async reject(reqUser, correctionId, reviewComment) {
    const prismaClient = getPrisma();

    if (![Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only authorized staff can reject corrections.', 403);
    }

    const correction = await prismaClient.attendanceCorrection.findUnique({
      where: { id: parseInt(correctionId, 10) },
    });

    if (!correction) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Correction request not found.', 404);
    }

    if (correction.status !== 'PENDING') {
      throw new AppError(AppErrorCodes.CONFLICT, `Correction is already ${correction.status.toLowerCase()}.`, 409);
    }

    const now = new Date();

    const updated = await prismaClient.attendanceCorrection.update({
      where: { id: parseInt(correctionId, 10) },
      data: {
        status: 'REJECTED',
        reviewedBy: reqUser.id,
        reviewedAt: now,
        reviewComment,
      },
    });

    await prismaClient.auditLog.create({
      data: {
        actorId: reqUser.id,
        actorRole: reqUser.role,
        action: 'REJECT_ATTENDANCE_CORRECTION',
        entityType: 'AttendanceCorrection',
        entityId: correctionId,
      },
    });

    logger.info('Attendance correction rejected', { correctionId, reviewerId: reqUser.id });

    return updated;
  }
}

const PAGE_SIZE = 20;

module.exports = { AttendanceCorrectionService };
