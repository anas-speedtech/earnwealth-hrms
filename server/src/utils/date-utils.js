const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');

const IST_OFFSET_MINUTES = 330;

function getTodayIST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + IST_OFFSET_MINUTES * 60000);
  ist.setHours(0, 0, 0, 0);
  return ist;
}

function toISTDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+05:30');
  d.setHours(0, 0, 0, 0);
  return d;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isHoliday(date, holidayDateSet) {
  return holidayDateSet.has(formatDateKey(date));
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function countWorkingDays(startDate, endDate, holidayDateSet, isHalfDay = false) {
  if (startDate > endDate) return 0;

  let count = 0;
  let current = new Date(startDate);

  while (current <= endDate) {
    if (!isWeekend(current) && !isHoliday(current, holidayDateSet)) {
      count += isHalfDay ? 0.5 : 1;
    }
    current = new Date(current.getTime() + 86400000);
  }

  return count;
}

function canAccessAll(reqUser) {
  return reqUser.role === Role.SUPER_ADMIN || reqUser.role === Role.HR_ADMIN || reqUser.role === Role.HR_ADMIN;
}

async function resolveLeaveAccess(reqUser, targetEmployeeId, prisma) {
  const isSelf = reqUser.id === targetEmployeeId;

  if (!isSelf && !canAccessAll(reqUser)) {
    throw new AppError(AppErrorCodes.FORBIDDEN, 'You can only access your own leave records.', 403);
  }

  if (isSelf) {
    const profile = await prisma.employeeProfile.findUnique({
      where: { userId: reqUser.id },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee profile not found.', 404);
    }
    return profile.id;
  }

  const target = await prisma.employeeProfile.findUnique({
    where: { id: targetEmployeeId },
    select: { id: true },
  });
  if (!target) {
    throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
  }
  return target.id;
}

module.exports = {
  getTodayIST,
  toISTDate,
  isWeekend,
  isHoliday,
  formatDateKey,
  countWorkingDays,
  resolveLeaveAccess,
  canAccessAll,
  IST_OFFSET_MINUTES,
};
