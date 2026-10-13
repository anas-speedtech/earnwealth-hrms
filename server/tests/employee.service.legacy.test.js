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

describe('EmployeeService legacy schema compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('blocks unauthorized list access before database calls', async () => {
    await expect(
      EmployeeService.list({ role: 'EMPLOYEE' }, { page: 1 }),
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  test('lists employees using actual employees columns', async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{
        id: 7,
        userId: null,
        employeeCode: 'EMP-007',
        name: 'Jane Doe',
        designation: 'Engineer',
        joiningDate: '2023-05-10',
        departmentText: null,
        isActive: 1,
        departmentId: null,
        email: null,
        departmentName: null,
      }]);

    const result = await EmployeeService.list({ role: 'SUPER_ADMIN' }, { page: 1 });

    expect(result.pagination.total).toBe(1);
    expect(result.pagination.pages).toBe(1);
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].firstName).toBe('Jane');
    expect(result.employees[0].lastName).toBe('Doe');
    expect(result.employees[0].employeeCode).toBe('EMP-007');
    expect(result.employees[0].status).toBe('ACTIVE');
  });

  test('throws when update has no supported fields', async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ id: 1, isActive: 1 }]);

    await expect(
      EmployeeService.update({ role: 'SUPER_ADMIN' }, 1, { phoneNumber: '12345' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.VALIDATION_ERROR, statusCode: 400 });
  });

  test('deactivates an active employee', async () => {
    mockQueryRawUnsafe.mockReset();
    mockExecuteRawUnsafe.mockReset();
    mockQueryRawUnsafe.mockResolvedValueOnce([{ id: 5, isActive: 1 }]);
    mockExecuteRawUnsafe.mockResolvedValue(1);

    const deactivated = await EmployeeService.deactivate({ role: 'SUPER_ADMIN' }, 5);
    expect(deactivated.status).toBe('INACTIVE');
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });

  test('activates an inactive employee', async () => {
    mockQueryRawUnsafe.mockReset();
    mockExecuteRawUnsafe.mockReset();
    mockQueryRawUnsafe.mockResolvedValueOnce([{ id: 5, isActive: 0 }]);
    mockExecuteRawUnsafe.mockResolvedValue(1);

    const activated = await EmployeeService.activate({ role: 'SUPER_ADMIN' }, 5);
    expect(activated.status).toBe('ACTIVE');
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });

  test('creates an employee against actual database columns', async () => {
    mockQueryRawUnsafe.mockReset();
    mockExecuteRawUnsafe.mockReset();
    mockQueryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 42 }]);
    mockExecuteRawUnsafe.mockResolvedValue(1);

    const created = await EmployeeService.create({ role: 'SUPER_ADMIN' }, {
      employeeCode: 'EMP-042',
      firstName: 'Jane',
      lastName: 'Doe',
      designation: 'Engineer',
      deviceEnrollNo: 1001,
      basicSalary: 50000,
      allowances: 2500,
      deductions: 500,
      joiningDate: '2024-01-15',
    });

    expect(created.id).toBe('42');
    expect(created.employeeCode).toBe('EMP-042');
    expect(created.firstName).toBe('Jane');
    expect(created.lastName).toBe('Doe');
    expect(created.designation).toBe('Engineer');
    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });

  test('rejects creation when a required numeric field is missing', async () => {
    await expect(
      EmployeeService.create({ role: 'SUPER_ADMIN' }, {
        employeeCode: 'EMP-043',
        firstName: 'Jane',
        lastName: 'Doe',
        designation: 'Engineer',
        deviceEnrollNo: 1002,
        allowances: 2500,
        deductions: 500,
        joiningDate: '2024-01-15',
      }),
    ).rejects.toMatchObject({ code: AppErrorCodes.VALIDATION_ERROR, statusCode: 400 });
  });
});
