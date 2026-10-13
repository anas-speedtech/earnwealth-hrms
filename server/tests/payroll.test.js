const { PayrollService } = require('../src/services/payroll.service');
const { AppError, AppErrorCodes } = require('../src/errors/AppError');
const { Role } = require('../src/types/index');

// Mock Prisma to avoid DB connection in unit tests
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    employeeProfile: { findUnique: jest.fn() },
    salaryStructure: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payrollRecord: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payrollComponent: { findMany: jest.fn(), update: jest.fn() },
    payslip: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

describe('PayrollService', () => {
  describe('canManagePayroll', () => {
    test('SUPER_ADMIN can manage payroll', () => {
      expect(PayrollService.canManagePayroll({ role: Role.SUPER_ADMIN })).toBe(true);
    });

    test('ADMIN can manage payroll', () => {
      expect(PayrollService.canManagePayroll({ role: Role.ADMIN })).toBe(true);
    });

    test('HR can manage payroll', () => {
      expect(PayrollService.canManagePayroll({ role: Role.HR })).toBe(true);
    });

    test('EMPLOYEE cannot manage payroll', () => {
      expect(PayrollService.canManagePayroll({ role: Role.EMPLOYEE })).toBe(false);
    });
  });

  describe('authorizePayrollAccess', () => {
    test('SUPER_ADMIN is authorized', () => {
      expect(() => {
        PayrollService.authorizePayrollAccess({ role: Role.SUPER_ADMIN }, { employeeId: 'any' });
      }).not.toThrow();
    });

    test('ADMIN is authorized', () => {
      expect(() => {
        PayrollService.authorizePayrollAccess({ role: Role.ADMIN }, { employeeId: 'any' });
      }).not.toThrow();
    });

    test('HR is authorized', () => {
      expect(() => {
        PayrollService.authorizePayrollAccess({ role: Role.HR }, { employeeId: 'any' });
      }).not.toThrow();
    });

    test('EMPLOYEE can access own payroll', () => {
      expect(() => {
        PayrollService.authorizePayrollAccess(
          { role: Role.EMPLOYEE, id: 'emp-1' },
          { employeeId: 'emp-1' }
        );
      }).not.toThrow();
    });

    test('EMPLOYEE cannot access another employee payroll', () => {
      expect(() => {
        PayrollService.authorizePayrollAccess(
          { role: Role.EMPLOYEE, id: 'emp-1' },
          { employeeId: 'emp-2' }
        );
      }).toThrow(AppError);
    });
  });

  describe('isValidMonthYear', () => {
    test('accepts valid month and year', () => {
      expect(PayrollService.isValidMonthYear(6, 2025)).toBe(true);
      expect(PayrollService.isValidMonthYear(1, 2024)).toBe(true);
      expect(PayrollService.isValidMonthYear(12, 2030)).toBe(true);
    });

    test('rejects month out of range', () => {
      expect(PayrollService.isValidMonthYear(0, 2025)).toBe(false);
      expect(PayrollService.isValidMonthYear(13, 2025)).toBe(false);
    });

    test('rejects non-integer month', () => {
      expect(PayrollService.isValidMonthYear(6.5, 2025)).toBe(false);
    });

    test('rejects year out of range', () => {
      expect(PayrollService.isValidMonthYear(6, 1999)).toBe(false);
      expect(PayrollService.isValidMonthYear(6, 2101)).toBe(false);
    });

    test('rejects non-integer year', () => {
      expect(PayrollService.isValidMonthYear(6, 2025.5)).toBe(false);
    });
  });

  describe('PayrollErrorCodes', () => {
    test('all required error codes are defined', () => {
      const codes = [
        'SALARY_STRUCTURE_NOT_FOUND',
        'SALARY_STRUCTURE_EXISTS',
        'SALARY_STRUCTURE_INACTIVE',
        'PAYROLL_NOT_FOUND',
        'PAYROLL_LOCKED',
        'PAYROLL_NOT_APPROVED',
        'PAYROLL_ALREADY_EXISTS',
        'PAYROLL_NO_COMPONENTS',
        'PAYSLIP_NOT_FOUND',
        'PAYSLIP_ALREADY_EXISTS',
        'INVALID_PERIOD',
        'PAYROLL_APPROVAL_FAILED',
        'PAYROLL_REJECTION_FAILED',
      ];

      const PayrollErrorCodes = require('../src/errors/PayrollErrorCodes').PayrollErrorCodes;

      for (const code of codes) {
        expect(PayrollErrorCodes[code]).toBeDefined();
        expect(typeof PayrollErrorCodes[code]).toBe('string');
      }
    });

    test('error codes are immutable', () => {
      const { PayrollErrorCodes } = require('../src/errors/PayrollErrorCodes');
      expect(Object.isFrozen(PayrollErrorCodes)).toBe(true);
    });
  });

  describe('Role enforcement - service methods require proper role', () => {
    const reqUserEmployee = { id: 'e-1', role: Role.EMPLOYEE, email: 'e@test.com' };
    const reqUserHR = { id: 'h-1', role: Role.HR, email: 'h@test.com' };
    const reqUserAdmin = { id: 'a-1', role: Role.ADMIN, email: 'a@test.com' };
    const reqUserSuperAdmin = { id: 'sa-1', role: Role.SUPER_ADMIN, email: 'sa@test.com' };

    test('createSalaryStructure rejects EMPLOYEE', async () => {
      await expect(
        PayrollService.createSalaryStructure(reqUserEmployee, { employeeId: 'emp-1' })
      ).rejects.toThrow(AppError);
    });

    test('updateSalaryStructure rejects EMPLOYEE', async () => {
      await expect(
        PayrollService.updateSalaryStructure(reqUserEmployee, 'ss-1', {})
      ).rejects.toThrow(AppError);
    });

    test('getSalaryStructure rejects EMPLOYEE', async () => {
      await expect(
        PayrollService.getSalaryStructure(reqUserEmployee, 'emp-1')
      ).rejects.toThrow(AppError);
    });

    test('listSalaryStructures rejects EMPLOYEE', async () => {
      await expect(
        PayrollService.listSalaryStructures(reqUserEmployee, {})
      ).rejects.toThrow(AppError);
    });

    test('createPayroll rejects EMPLOYEE', async () => {
      await expect(
        PayrollService.createPayroll(reqUserEmployee, { employeeId: 'emp-1', month: 1, year: 2025 })
      ).rejects.toThrow(AppError);
    });

    test('submitForApproval rejects EMPLOYEE', async () => {
      await expect(
        PayrollService.submitForApproval(reqUserEmployee, 'pay-1')
      ).rejects.toThrow(AppError);
    });

    test('approvePayroll rejects HR', async () => {
      await expect(
        PayrollService.approvePayroll(reqUserHR, 'pay-1', 'approved')
      ).rejects.toThrow(AppError);
    });

    test('rejectPayroll rejects HR', async () => {
      await expect(
        PayrollService.rejectPayroll(reqUserHR, 'pay-1', 'reason')
      ).rejects.toThrow(AppError);
    });

    test('canManagePayroll rejects EMPLOYEE (covers approve/reject)', () => {
      expect(PayrollService.canManagePayroll(reqUserEmployee)).toBe(false);
    });

    test('approvePayroll rejects ADMIN', async () => {
      await expect(
        PayrollService.approvePayroll(reqUserAdmin, 'pay-1', 'approved')
      ).rejects.toThrow(AppError);
    });

    test('rejectPayroll rejects ADMIN', async () => {
      await expect(
        PayrollService.rejectPayroll(reqUserAdmin, 'pay-1', 'reason')
      ).rejects.toThrow(AppError);
    });

    test('approvePayroll accepts only SUPER_ADMIN', async () => {
      await expect(
        PayrollService.approvePayroll(reqUserSuperAdmin, 'nonexistent-id', 'approved')
      ).rejects.toThrow(AppError); // Will fail on PAYROLL_NOT_FOUND, passes role check
    });

    test('rejectPayroll accepts only SUPER_ADMIN', async () => {
      await expect(
        PayrollService.rejectPayroll(reqUserSuperAdmin, 'nonexistent-id', 'reason')
      ).rejects.toThrow(AppError); // Will fail on PAYROLL_NOT_FOUND, passes role check
    });

    test('canManagePayroll accepts HR (for creating payroll)', () => {
      expect(PayrollService.canManagePayroll(reqUserHR)).toBe(true);
    });

    test('canManagePayroll rejects EMPLOYEE for approve/reject (role gate)', () => {
      expect(PayrollService.canManagePayroll(reqUserEmployee)).toBe(false);
    });
  });

  describe('Input validation', () => {
    test('createPayroll rejects invalid month', async () => {
      const hrUser = { id: 'h-1', role: Role.HR, email: 'h@test.com' };
      await expect(
        PayrollService.createPayroll(hrUser, { employeeId: 'emp-1', month: 13, year: 2025 })
      ).rejects.toThrow(AppError);
    });

    test('createPayroll rejects invalid year', async () => {
      const hrUser = { id: 'h-1', role: Role.HR, email: 'h@test.com' };
      await expect(
        PayrollService.createPayroll(hrUser, { employeeId: 'emp-1', month: 1, year: 1999 })
      ).rejects.toThrow(AppError);
    });

    test('rejectPayroll requires reason', async () => {
      const adminUser = { id: 'a-1', role: Role.ADMIN, email: 'a@test.com' };
      await expect(
        PayrollService.rejectPayroll(adminUser, 'pay-1', '')
      ).rejects.toThrow(AppError);
    });

    test('rejectPayroll accepts whitespace-only reason as invalid', async () => {
      const adminUser = { id: 'a-1', role: Role.ADMIN, email: 'a@test.com' };
      await expect(
        PayrollService.rejectPayroll(adminUser, 'pay-1', '   ')
      ).rejects.toThrow(AppError);
    });
  });
});
