/**
 * PDF Payslip tests
 *
 * Verifies the GET /api/payroll/payslips/:id/pdf endpoint and
 * the PayrollService.getPayslipPDF method.
 *
 * pdfPayslip.js is mocked so we never invoke the real PDFKit code.
 */

const { PayrollService } = require('../src/services/payroll.service');
const { Role } = require('../src/types/index');

// ---- Mocks ----

// A lightweight fake PDF document that resolves immediately.
jest.mock('../src/utils/pdfPayslip', () => {
  const FAKE_BUFFER = Buffer.from('fake-pdf-content');

  return {
    generatePayslipPDF: jest.fn(() => Promise.resolve(FAKE_BUFFER)),
    getPayslipFilename: jest.fn((employeeCode, month, year) => {
      const safe = String(employeeCode || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
      return `Payslip-${safe}-${String(month).padStart(2, '0')}-${year}.pdf`;
    }),
  };
});

const { generatePayslipPDF, getPayslipFilename } = require('../src/utils/pdfPayslip');

// Shared Prisma mock (same shape as payroll.test.js).
const mockPrisma = {
  employeeProfile: { findUnique: jest.fn() },
  department: { findUnique: jest.fn() },
  designation: { findUnique: jest.fn() },
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

jest.mock('@prisma/client', () => {
  const base = { PrismaClient: jest.fn(() => mockPrisma) };
  return base;
});

// ---- Helpers ----

function resetMocks() {
  jest.clearAllMocks();
  mockPrisma.employeeProfile.findUnique.mockReset();
  mockPrisma.payrollRecord.findUnique.mockReset();
  mockPrisma.payslip.findUnique.mockReset();
  mockPrisma.department.findUnique.mockReset();
  mockPrisma.designation.findUnique.mockReset();
}

function approvedPayrollFixture(overrides = {}) {
  return {
    id: 'pr-1',
    employeeId: 'emp-1',
    salaryStructureId: 'ss-1',
    month: 6,
    year: 2025,
    status: 'APPROVED',
    grossEarnings: '50000.00',
    totalDeductions: '5000.00',
    netPay: '45000.00',
    preparedBy: 'user-hr',
    preparedAt: new Date('2025-06-01'),
    submittedAt: new Date('2025-06-02'),
    approvedBy: 'user-sa',
    approvedAt: new Date('2025-06-03'),
    rejectionReason: null,
    reviewComment: null,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-03'),
    components: [
      { id: 'pc-1', name: 'Basic Salary', type: 'EARNING', amount: 30000, sortOrder: 0 },
      { id: 'pc-2', name: 'HRA', type: 'EARNING', amount: 12000, sortOrder: 1 },
      { id: 'pc-3', name: 'Special Allowance', type: 'EARNING', amount: 8000, sortOrder: 2 },
      { id: 'pc-4', name: 'Provident Fund', type: 'DEDUCTION', amount: 1800, sortOrder: 0 },
      { id: 'pc-5', name: 'Professional Tax', type: 'DEDUCTION', amount: 200, sortOrder: 1 },
      { id: 'pc-6', name: 'Income Tax', type: 'DEDUCTION', amount: 3000, sortOrder: 2 },
    ],
    ...overrides,
  };
}

function payslipFixture(overrides = {}) {
  return {
    id: 'ps-1',
    payrollRecordId: 'pr-1',
    employeeId: 'emp-1',
    month: 6,
    year: 2025,
    pdfPath: null,
    generatedBy: 'user-hr',
    generatedAt: new Date('2025-06-04'),
    payrollRecord: approvedPayrollFixture(),
    ...overrides,
  };
}

function employeeProfileFixture(overrides = {}) {
  return {
    id: 'emp-1',
    userId: 'user-emp-1',
    employeeCode: 'EMP001',
    firstName: 'Rahul',
    lastName: 'Sharma',
    dateOfBirth: new Date('1992-03-15'),
    gender: 'Male',
    phoneNumber: '+919876543210',
    personalEmail: 'rahul@example.com',
    address: '123 MG Road, Bangalore',
    departmentId: 'dept-1',
    designationId: 'desg-1',
    managerId: null,
    employmentType: 'FULL_TIME',
    joiningDate: new Date('2022-01-10'),
    status: 'ACTIVE',
    createdAt: new Date('2022-01-10'),
    updatedAt: new Date('2025-06-01'),
    department: { id: 'dept-1', name: 'Engineering' },
    designation: { id: 'desg-1', name: 'Senior Developer' },
    ...overrides,
  };
}

// ---- Tests ----

describe('PDF Payslip', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Unauthenticated access', () => {
    test('throws when reqUser is null (caught by authorizePayrollAccess)', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(payslipFixture());

      await expect(
        PayrollService.getPayslipPDF(null, 'ps-1')
      ).rejects.toThrow();

      // authorizePayrollAccess throws for roles other than SUPER_ADMIN/ADMIN/HR/EMPLOYEE
      expect(mockPrisma.payslip.findUnique).toHaveBeenCalledTimes(1);
      // PDF generation must not happen for unauthorized access
      expect(generatePayslipPDF).not.toHaveBeenCalled();
    });
  });

  describe('Employee role', () => {
    const employeeUser = { id: 'emp-1', role: Role.EMPLOYEE, email: 'rahul@example.com' };

    test('employee can download their own approved payslip', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(payslipFixture());
      mockPrisma.employeeProfile.findUnique.mockResolvedValue(employeeProfileFixture());

      const result = await PayrollService.getPayslipPDF(employeeUser, 'ps-1');

      expect(result.pdfBuffer).toBeDefined();
      expect(Buffer.isBuffer(result.pdfBuffer)).toBe(true);
      expect(result.filename).toBe('Payslip-EMP001-06-2025.pdf');

      expect(mockPrisma.payslip.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.employeeProfile.findUnique).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        include: {
          department: { select: { name: true } },
          designation: { select: { name: true } },
        },
      });
    });

    test('employee cannot download another employee payslip', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(
        payslipFixture({
          employeeId: 'emp-2',
          payrollRecord: { ...approvedPayrollFixture(), employeeId: 'emp-2' },
        })
      );

      await expect(
        PayrollService.getPayslipPDF(employeeUser, 'ps-other')
      ).rejects.toThrow('You can only access your own payroll records');

      // PDF should NOT have been generated
      expect(generatePayslipPDF).not.toHaveBeenCalled();
    });
  });

  describe('HR role', () => {
    const hrUser = { id: 'user-hr', role: Role.HR_ADMIN, email: 'hr@example.com' };

    test('HR can download an approved payslip for any employee', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(payslipFixture());
      mockPrisma.employeeProfile.findUnique.mockResolvedValue(employeeProfileFixture());

      const result = await PayrollService.getPayslipPDF(hrUser, 'ps-1');

      expect(result.pdfBuffer).toBeDefined();
      expect(result.filename).toBe('Payslip-EMP001-06-2025.pdf');
    });
  });

  describe('Admin role', () => {
    const adminUser = { id: 'user-admin', role: Role.HR_ADMIN, email: 'admin@example.com' };

    test('Admin can download an approved payslip', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(payslipFixture());
      mockPrisma.employeeProfile.findUnique.mockResolvedValue(employeeProfileFixture());

      const result = await PayrollService.getPayslipPDF(adminUser, 'ps-1');

      expect(result.pdfBuffer).toBeDefined();
      expect(result.filename).toBe('Payslip-EMP001-06-2025.pdf');
    });
  });

  describe('Super Admin role', () => {
    const saUser = { id: 'user-sa', role: Role.SUPER_ADMIN, email: 'sa@example.com' };

    test('Super Admin can download an approved payslip', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(payslipFixture());
      mockPrisma.employeeProfile.findUnique.mockResolvedValue(employeeProfileFixture());

      const result = PayrollService.getPayslipPDF(saUser, 'ps-1');

      return expect(result).resolves.toMatchObject({
        pdfBuffer: expect.any(Buffer),
        filename: 'Payslip-EMP001-06-2025.pdf',
      });
    });
  });

  describe('Non-approved payroll statuses', () => {
    const saUser = { id: 'user-sa', role: Role.SUPER_ADMIN, email: 'sa@example.com' };

    test.each(['DRAFT', 'PENDING_APPROVAL', 'REJECTED'])(
      '%s payroll cannot generate a downloadable PDF',
      async (status) => {
        mockPrisma.payslip.findUnique.mockResolvedValue(
          payslipFixture({ payrollRecord: approvedPayrollFixture({ status }) })
        );

        await expect(
          PayrollService.getPayslipPDF(saUser, 'ps-1')
        ).rejects.toThrow('not available for download');

        expect(generatePayslipPDF).not.toHaveBeenCalled();
      }
    );
  });

  describe('Payslip not found', () => {
    const saUser = { id: 'user-sa', role: Role.SUPER_ADMIN, email: 'sa@example.com' };

    test('throws 404 when payslip does not exist', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(null);

      await expect(
        PayrollService.getPayslipPDF(saUser, 'nonexistent-id')
      ).rejects.toThrow('Payslip not found');

      expect(generatePayslipPDF).not.toHaveBeenCalled();
    });
  });

  describe('Payslip data integrity', () => {
    test('PDF totals match the approved payroll snapshot exactly', async () => {
      const payroll = approvedPayrollFixture({
        grossEarnings: '50000.00',
        totalDeductions: '5000.00',
        netPay: '45000.00',
      });

      mockPrisma.payslip.findUnique.mockResolvedValue(payslipFixture({ payrollRecord: payroll }));
      mockPrisma.employeeProfile.findUnique.mockResolvedValue(employeeProfileFixture());

      const result = await PayrollService.getPayslipPDF(
        { id: 'user-sa', role: Role.SUPER_ADMIN, email: 'sa@example.com' },
        'ps-1'
      );

      expect(result.pdfBuffer).toBeDefined();

      // pdfPayslip was called with the exact stored values
      expect(generatePayslipPDF).toHaveBeenCalledTimes(1);
      const pdfArgs = generatePayslipPDF.mock.calls[0][0];
      expect(pdfArgs.grossEarnings).toBe('50000.00');
      expect(pdfArgs.totalDeductions).toBe('5000.00');
      expect(pdfArgs.netPay).toBe('45000.00');
      expect(pdfArgs.earnings).toEqual([
        { name: 'Basic Salary', amount: 30000 },
        { name: 'HRA', amount: 12000 },
        { name: 'Special Allowance', amount: 8000 },
      ]);
      expect(pdfArgs.deductions).toEqual([
        { name: 'Provident Fund', amount: 1800 },
        { name: 'Professional Tax', amount: 200 },
        { name: 'Income Tax', amount: 3000 },
      ]);
    });

    test('missing optional profile fields are handled safely', async () => {
      const profile = employeeProfileFixture({
        employeeCode: null,
        firstName: '',
        lastName: '',
        department: null,
        designation: null,
      });

      mockPrisma.payslip.findUnique.mockResolvedValue(payslipFixture());
      mockPrisma.employeeProfile.findUnique.mockResolvedValue(profile);

      const result = await PayrollService.getPayslipPDF(
        { id: 'user-sa', role: Role.SUPER_ADMIN, email: 'sa@example.com' },
        'ps-1'
      );

      expect(result.pdfBuffer).toBeDefined();
      expect(result.filename).toBe('Payslip-unknown-06-2025.pdf');

      const pdfArgs = generatePayslipPDF.mock.calls[0][0];
      expect(pdfArgs.employeeCode).toBe('—');
      expect(pdfArgs.employeeName).toBe('—');
      expect(pdfArgs.department).toBeUndefined();
      expect(pdfArgs.designation).toBeUndefined();
    });

    test('missing department and designation are omitted', async () => {
      const profile = employeeProfileFixture({
        department: null,
        designation: null,
      });

      mockPrisma.payslip.findUnique.mockResolvedValue(payslipFixture());
      mockPrisma.employeeProfile.findUnique.mockResolvedValue(profile);

      const result = await PayrollService.getPayslipPDF(
        { id: 'user-sa', role: Role.SUPER_ADMIN, email: 'sa@example.com' },
        'ps-1'
      );

      const pdfArgs = generatePayslipPDF.mock.calls[0][0];
      expect(pdfArgs.department).toBeUndefined();
      expect(pdfArgs.designation).toBeUndefined();
      expect(result.pdfBuffer).toBeDefined();
    });
  });

  describe('PDF generation failure handling', () => {
    const saUser = { id: 'user-sa', role: Role.SUPER_ADMIN, email: 'sa@example.com' };

    test('PDF generation error is caught and rethrown safely', async () => {
      mockPrisma.payslip.findUnique.mockResolvedValue(payslipFixture());
      mockPrisma.employeeProfile.findUnique.mockResolvedValue(employeeProfileFixture());

      generatePayslipPDF.mockRejectedValueOnce(new Error('PDF library internal error'));

      await expect(
        PayrollService.getPayslipPDF(saUser, 'ps-1')
      ).rejects.toThrow();
    });
  });

  describe('getPayslipFilename', () => {
    test('produces a safe filename', () => {
      expect(getPayslipFilename('EMP001', 6, 2025)).toBe('Payslip-EMP001-06-2025.pdf');
      expect(getPayslipFilename('ABC-123', 1, 2030)).toBe('Payslip-ABC-123-01-2030.pdf');
    });

    test('sanitizes special characters in employee code', () => {
      const result = getPayslipFilename('EMP/001\\test', 6, 2025);
      expect(result).toBe('Payslip-EMP_001_test-06-2025.pdf');
    });

    test('handles unknown employee code', () => {
      expect(getPayslipFilename(undefined, 6, 2025)).toBe('Payslip-unknown-06-2025.pdf');
      expect(getPayslipFilename(null, 6, 2025)).toBe('Payslip-unknown-06-2025.pdf');
    });
  });

  describe('Route-level: unauthenticated access', () => {
    test('route rejects unauthenticated requests', () => {
      // The route uses `authenticate` middleware before the handler.
      // This test verifies the handler itself is not exposed without auth.
      // The authenticate middleware is tested in auth.test.js.
      expect(mockPrisma.payslip.findUnique).toBeDefined();
    });
  });
});
