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

const { EmployeeService } = require('../src/services/employee.service');

describe('Employee update contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryRawUnsafe.mockReset();
    mockExecuteRawUnsafe.mockReset();
  });

  test('blocks unauthorized updates', async () => {
    await expect(
      EmployeeService.update({ role: 'EMPLOYEE' }, 1, { firstName: 'Jane' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  test('rejects unsupported-only update payloads', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ id: 9, name: 'John Doe', isActive: 1 }]);

    await expect(
      EmployeeService.update({ role: 'SUPER_ADMIN' }, 9, { phoneNumber: '555-0100', employmentType: 'FULL_TIME' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.VALIDATION_ERROR, statusCode: 400 });
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  test('rejects duplicate employee code during update', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ id: 9, name: 'John Doe', employeeCode: 'EMP-OLD', isActive: 1 }])
      .mockResolvedValueOnce([{ id: 99 }]);

    await expect(
      EmployeeService.update({ role: 'SUPER_ADMIN' }, 9, { employeeCode: 'EMP-NEW' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.DUPLICATE_ENTRY, statusCode: 409 });
    expect(mockExecuteRawUnsafe).not.toHaveBeenCalled();
  });

  test('updates supported fields', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ id: 9, name: 'John Doe', isActive: 1 }])
      .mockResolvedValueOnce([{ id: 9, employeeCode: 'EMP-009', name: 'Jane Doe', designation: 'Engineer', departmentId: null, departmentText: null, joiningDate: '2024-01-15', basicSalary: 60000, allowances: 1000, deductions: 500, isActive: 1 }]);
    mockExecuteRawUnsafe.mockResolvedValue(1);

    const updated = await EmployeeService.update({ role: 'SUPER_ADMIN' }, 9, {
      firstName: 'Jane',
      basicSalary: 60000,
      status: 'ACTIVE',
    });

    expect(updated.id).toBe('9');
    expect(updated.firstName).toBe('Jane');
    expect(updated.lastName).toBe('Doe');
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
