/**
 * Tests for UserManagementService.create() permissions.
 *
 * Strategy:
 *   - Module is loaded ONCE with normal require.
 *   - We mock @prisma/client so PrismaClient is a jest.fn() that returns our mock instance.
 *   - We mock ./email.service to avoid real email sending.
 *   - The mock prisma instance has $queryRawUnsafe and $executeRawUnsafe mocked.
 */

const { AppErrorCodes } = require('../src/errors/AppError');

// ── Mock email service ───────────────────────────────────────────────────────
jest.mock('../src/services/email.service', () => ({
  sendAccountCreatedEmail: jest.fn().mockResolvedValue({ sent: true }),
}));

// ── Mock Prisma instance ─────────────────────────────────────────────────────
const mockQueryRaw = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockExecuteRaw = jest.fn().mockResolvedValue(1);
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(1);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    $queryRaw: mockQueryRaw,
    $queryRawUnsafe: mockQueryRawUnsafe,
    $executeRaw: mockExecuteRaw,
    $executeRawUnsafe: mockExecuteRawUnsafe,
  })),
}));

const { UserManagementService } = require('../src/services/user-management.service');

// ── Helper to configure mock for create flow ─────────────────────────────────
// The service (least-privilege contract) requires a manually-entered,
// numeric employee code for every provisioned account, and the dup-code
// lookup only reports a collision when the test opts in via `existingCode`.
function configureMockForCreate({ existingEmail = null, existingCode = null } = {}) {
  let capturedRole = 'EMPLOYEE';
  const handler = (templateOrSql, ...bindings) => {
    let sqlStr = '';
    if (Array.isArray(templateOrSql)) {
      sqlStr = templateOrSql.join('');
    } else {
      sqlStr = String(templateOrSql);
    }

    if (sqlStr.includes('SELECT id FROM users')) {
      if (existingEmail) {
        return Promise.resolve([{ id: 1 }]);
      }
      return Promise.resolve([]);
    }
    if (sqlStr.includes('SELECT id, name, email, role')) {
      // Reflect the email used in the WHERE binding so the returned row
      // matches what was actually inserted.
      return Promise.resolve([{
        id: 99,
        name: 'Test User',
        email: bindings[0] || 'test@example.com',
        role: capturedRole,
        isActive: 1,
        createdAt: new Date(),
      }]);
    }
    if (sqlStr.includes('FROM employees WHERE employeeCode')) {
      // Duplicate only when the test opts in; otherwise the code is free.
      return Promise.resolve(existingCode ? [{ id: 5, userId: null }] : []);
    }
    if (sqlStr.includes('FROM employees WHERE name')) {
      return Promise.resolve([{ id: 9, name: 'Manager Name' }]);
    }
    return Promise.resolve([]);
  };
  mockQueryRaw.mockImplementation(handler);
  mockQueryRawUnsafe.mockImplementation(handler);

  // Capture role from INSERT statement
  mockExecuteRaw.mockImplementation((templateOrSql, ...bindings) => {
    let sqlStr = '';
    if (Array.isArray(templateOrSql)) {
      sqlStr = templateOrSql.join('');
    } else {
      sqlStr = String(templateOrSql);
    }
    if (sqlStr.includes('INSERT INTO users')) {
      capturedRole = bindings[3] || 'EMPLOYEE';
    }
    return Promise.resolve(1);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('UserManagementService.create() — role permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteRawUnsafe.mockResolvedValue(1);
  });

  test('HR Admin creating an Employee account is permitted', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'HR_ADMIN' };
    const result = await UserManagementService.create(actor, {
      name: 'Test Employee',
      email: 'emp.test@example.com',
      password: 'TestPass123!',
      role: 'EMPLOYEE',
      // The service requires a manual numeric employee code and a reporting
      // manager for every Employee account.
      employeeCode: '1001',
      reportingManager: 'Manager Name',
    });
    expect(result).toBeDefined();
    expect(result.id).toBe('99');
    expect(result.email).toBe('emp.test@example.com');
    expect(result.role).toBe('EMPLOYEE');
    expect(result.employeeCode).toBe('1001');
  });

  test('HR Admin creating an HR Admin account is rejected with 403', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'HR_ADMIN' };
    await expect(
      UserManagementService.create(actor, {
        name: 'New HR Admin',
        email: 'hr.new@example.com',
        password: 'TestPass123!',
        role: 'HR_ADMIN',
      })
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
  });

  test('HR Admin creating a Super Admin account is rejected with 403', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'HR_ADMIN' };
    await expect(
      UserManagementService.create(actor, {
        name: 'New Super Admin',
        email: 'sa.new@example.com',
        password: 'TestPass123!',
        role: 'SUPER_ADMIN',
      })
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
  });

  // Least-privilege contract: Super Admins may only appoint HR Admins;
  // Employee accounts are provisioned by HR Admins.
  test('Super Admin creating an Employee account is rejected with 403', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'SUPER_ADMIN' };
    await expect(
      UserManagementService.create(actor, {
        name: 'Test Employee',
        email: 'emp.test2@example.com',
        password: 'TestPass123!',
        role: 'EMPLOYEE',
        employeeCode: '1002',
        reportingManager: 'Manager Name',
      })
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
  });

  test('Super Admin creating an HR Admin account is permitted', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'SUPER_ADMIN' };
    const result = await UserManagementService.create(actor, {
      name: 'New HR Admin',
      email: 'hr.new2@example.com',
      password: 'TestPass123!',
      role: 'HR_ADMIN',
      // The manual numeric employee code is required for every provisioned
      // account (the service validates it before any insert).
      employeeCode: '2001',
    });
    expect(result).toBeDefined();
    expect(result.id).toBe('99');
    expect(result.email).toBe('hr.new2@example.com');
    expect(result.role).toBe('HR_ADMIN');
    expect(result.employeeCode).toBe('2001');
  });

  test('Super Admin creating a Super Admin account is rejected with 403', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'SUPER_ADMIN' };
    await expect(
      UserManagementService.create(actor, {
        name: 'New Super Admin',
        email: 'sa.new2@example.com',
        password: 'TestPass123!',
        role: 'SUPER_ADMIN',
      })
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
  });

  test('Duplicate email is rejected with 409', async () => {
    configureMockForCreate({ existingEmail: 'existing@example.com' });
    const actor = { id: 1, role: 'SUPER_ADMIN' };
    // Super Admin may only appoint HR Admins, so use that role to reach the
    // email-dup check (code check passes; email collision is what fires).
    await expect(
      UserManagementService.create(actor, {
        name: 'Duplicate User',
        email: 'existing@example.com',
        password: 'TestPass123!',
        role: 'HR_ADMIN',
        employeeCode: '3001',
      })
    ).rejects.toMatchObject({ code: AppErrorCodes.DUPLICATE_ENTRY, statusCode: 409 });
  });

  test('Invalid role is rejected with 403', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'SUPER_ADMIN' };
    await expect(
      UserManagementService.create(actor, {
        name: 'Bad Role',
        email: 'badrole@example.com',
        password: 'TestPass123!',
        role: 'INVALID_ROLE',
      })
    ).rejects.toMatchObject({ code: AppErrorCodes.FORBIDDEN, statusCode: 403 });
  });

  test('Employee code and reporting manager are saved and returned', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'HR_ADMIN' };
    const result = await UserManagementService.create(actor, {
      name: 'Linked Employee',
      email: 'linked@example.com',
      password: 'TestPass123!',
      role: 'EMPLOYEE',
      employeeCode: '1001',
      reportingManager: 'Manager Name',
    });
    expect(result.employeeCode).toBe('1001');
    expect(result.reportingManager).toBe('Manager Name');
  });

  test('Duplicate employee code is rejected with 409', async () => {
    configureMockForCreate({ existingCode: '4001' });
    const actor = { id: 1, role: 'HR_ADMIN' };
    await expect(
      UserManagementService.create(actor, {
        name: 'Clash',
        email: 'clash@example.com',
        password: 'TestPass123!',
        role: 'EMPLOYEE',
        employeeCode: '4001',
        reportingManager: 'Manager Name',
      })
    ).rejects.toMatchObject({ code: AppErrorCodes.DUPLICATE_ENTRY, statusCode: 409 });
  });

  test('Missing employee code is rejected with 400', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'HR_ADMIN' };
    await expect(
      UserManagementService.create(actor, {
        name: 'No Code',
        email: 'nocode@example.com',
        password: 'TestPass123!',
        role: 'EMPLOYEE',
        reportingManager: 'Manager Name',
      })
    ).rejects.toMatchObject({ code: AppErrorCodes.VALIDATION_ERROR, statusCode: 400 });
  });

  test('Non-numeric employee code is rejected with 400', async () => {
    configureMockForCreate();
    const actor = { id: 1, role: 'HR_ADMIN' };
    await expect(
      UserManagementService.create(actor, {
        name: 'Orphan',
        email: 'orphan@example.com',
        password: 'TestPass123!',
        role: 'EMPLOYEE',
        employeeCode: 'EMP-9999',
        reportingManager: 'Manager Name',
      })
    ).rejects.toMatchObject({ code: AppErrorCodes.VALIDATION_ERROR, statusCode: 400 });
  });
});