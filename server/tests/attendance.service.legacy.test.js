const { AppErrorCodes } = require('../src/errors/AppError');

const mockQueryRawUnsafe = jest.fn();
const mockExecuteRawUnsafe = jest.fn();
const mockPrismaInstance = {
  $queryRawUnsafe: mockQueryRawUnsafe,
  $executeRawUnsafe: mockExecuteRawUnsafe,
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaInstance),
}));

const { AttendanceService } = require('../src/services/attendance.service');

describe('AttendanceService legacy schema compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockQueryRawUnsafe.mockReset();
    mockExecuteRawUnsafe.mockReset();
    AttendanceService.resetPrisma();
  });

  test('denies another employee profile', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ id: '2', userId: '2', isActive: 1 }]);

    await expect(
      AttendanceService.getHistory({ role: 'EMPLOYEE', id: '1' }, '2', { page: 1 }),
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
  });

  test('history permission allows self-targeted employee query', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ id: '5', userId: '5', isActive: 1 }]) // resolveTargetEmployee
      .mockResolvedValueOnce([]); // history rows

    const result = await AttendanceService.getHistory({ role: 'EMPLOYEE', id: '5' }, '5', { page: 1 });
    expect(result.records).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  test('allows a user to read only their own employee history', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ id: '5', userId: '1', isActive: 1 }])
      .mockResolvedValueOnce([]);

    const result = await AttendanceService.getHistory({ role: 'EMPLOYEE', id: '1' }, '5', { page: 1 });
    expect(result.records).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  test('returns NOT_FOUND for a missing employee profile', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([]);

    await expect(
      AttendanceService.getHistory({ role: 'EMPLOYEE', id: '1' }, '7', { page: 1 }),
    ).rejects.toMatchObject({ code: AppErrorCodes.NOT_FOUND, statusCode: 404 });
  });

  test('denies another employee profile during ownership check', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ id: '7', userId: '2', isActive: 1 }]);

    await expect(
      AttendanceService.getHistory({ role: 'EMPLOYEE', id: '1' }, '7', { page: 1 }),
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
  });

  test('rejects invalid punch mode', async () => {
    await expect(
      AttendanceService.punchIn({ role: 'EMPLOYEE', id: '5' }, { employeeId: '5', workMode: 'REMOTE' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.INVALID_INPUT, statusCode: 400 });
  });

  test('punch in rejects duplicate active session', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ id: '5', userId: '5', isActive: 1 }]) // resolve target
      .mockResolvedValueOnce([{ id: '5', isActive: 1 }]) // active check
      .mockResolvedValueOnce([{ id: 10, punchTime: new Date('2026-10-13T08:00:00Z'), status: 'IN' }]); // last punch

    await expect(
      AttendanceService.punchIn({ role: 'EMPLOYEE', id: '5' }, { employeeId: '5', workMode: 'OFFICE' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.ATTENDANCE_ALREADY_PUNCHED, statusCode: 409 });
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  test('validates punch-out date order', async () => {
    const punchDate = new Date(Date.now() + 60 * 60 * 1000);

    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ id: '5', userId: '5', isActive: 1 }])
      .mockResolvedValueOnce([{ id: 10, punchTime: punchDate, status: 'IN' }])
      .mockResolvedValueOnce([{ elapsedSeconds: -3600 }]);

    await expect(
      AttendanceService.punchOut({ role: 'EMPLOYEE', id: '5' }, { employeeId: '5' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.INVALID_INPUT, statusCode: 400 });
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });
  test('summary totals all matching dates, including more than one page of history', async () => {
    const logs = [];

    for (let index = 0; index < 21; index += 1) {
      const day = String(index + 1).padStart(2, '0');
      logs.push({ id: index * 2 + 1, punchTime: new Date('2026-01-' + day + 'T08:00:00.000Z'), status: 'IN' });
      logs.push({ id: index * 2 + 2, punchTime: new Date('2026-01-' + day + 'T13:00:00.000Z'), status: 'OUT' });
    }

    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ id: '5', userId: '1', isActive: 1 }])
      .mockResolvedValueOnce(logs);

    const summary = await AttendanceService.getSummary({ role: 'SUPER_ADMIN', id: '1' }, '5', {});

    expect(summary.totalDays).toBe(21);
    expect(summary.totalPresent).toBe(21);
    expect(summary.totalPartial).toBe(0);
    expect(summary.totalMinutes).toBe(6300);
    expect(summary.totalSessions).toBe(21);
    expect(summary.avgMinutesPerDay).toBe(300);
  });

  test('summary rejects access to another employee profile', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ id: '7', userId: '2', isActive: 1 }]);

    await expect(
      AttendanceService.getSummary({ role: 'EMPLOYEE', id: '1' }, '7', {}),
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
  });
  test('punch-out success uses a valid latest IN and reports MySQL duration', async () => {
    const punchInTime = new Date('2026-01-01T08:00:00.000Z');
    const punchOutTime = new Date('2026-01-01T08:05:00.000Z');

    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ id: '5', userId: '5', isActive: 1 }]) // resolve target
      .mockResolvedValueOnce([{ id: 10, punchTime: punchInTime, status: 'IN' }]) // last punch
      .mockResolvedValueOnce([{ elapsedSeconds: 300 }]) // MySQL TIMESTAMPDIFF
      .mockResolvedValueOnce([{ id: 20, punchTime: punchOutTime }]); // inserted OUT

    const result = await AttendanceService.punchOut({ role: 'EMPLOYEE', id: '5' }, { employeeId: '5' });

    expect(result.id).toBe('20');
    expect(result.punchOut).toBe(punchOutTime);
    expect(result.durationMinutes).toBe(5);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });

  test('punch-out throws a controlled error when the inserted record is missing', async () => {
    const punchInTime = new Date('2026-01-01T08:00:00.000Z');

    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ id: '5', userId: '5', isActive: 1 }])
      .mockResolvedValueOnce([{ id: 10, punchTime: punchInTime, status: 'IN' }])
      .mockResolvedValueOnce([{ elapsedSeconds: 300 }])
      .mockResolvedValueOnce([]);

    await expect(
      AttendanceService.punchOut({ role: 'EMPLOYEE', id: '5' }, { employeeId: '5' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.INTERNAL_ERROR, statusCode: 500 });
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
