/**
 * Tests for AuthService login and getMe against the deployed database schema.
 *
 * Strategy:
 *   - Module is loaded ONCE with normal require (no jest.doMock, no resetModules).
 *   - We inject a mock Prisma instance via setupTestPrisma() before each test.
 *   - resetPrisma() clears the module-level cache between tests so a fresh
 *     Prisma is re-created with the current mock.
 */

const { AppError, AppErrorCodes } = require('../src/errors/AppError');
const { hashPassword, comparePassword } = require('../src/utils/password');

// ── Mock Prisma instance ──────────────────────────────────────────────────

const mockQueryRaw = jest.fn();
const mockExecuteRaw = jest.fn().mockResolvedValue(1);
const mockRefreshTokenCreate = jest.fn().mockResolvedValue(undefined);
const mockAuditLogCreate = jest.fn().mockResolvedValue(undefined);
const mockUserUpdate = jest.fn().mockResolvedValue(undefined);

const mockPrismaInstance = {
  $queryRaw: mockQueryRaw,
  $executeRaw: mockExecuteRaw,
  refreshToken: { create: mockRefreshTokenCreate },
  auditLog: { create: mockAuditLogCreate },
  user: { update: mockUserUpdate },
};

// ── Test data ────────────────────────────────────────────────────────────

const seededUser = {
  id: 1,
  email: 'admin@earnwealth.com',
  passwordHash: null,
  role: 'SUPER_ADMIN',
  isActive: 1,
  name: 'Super Admin',
};

function configureMockForUser(passwordHash, isActive = 1) {
  seededUser.passwordHash = passwordHash;
  seededUser.isActive = isActive;

  mockQueryRaw.mockImplementation((templateOrSql, ...bindings) => {
    // Prisma $queryRaw tagged template: templateOrSql is TemplateStringsArray
    // parameters are passed in bindings after it
    let sqlStr = '';
    let params = bindings;

    if (Array.isArray(templateOrSql)) {
      // TemplateStringsArray — join the raw string fragments
      sqlStr = templateOrSql.join('');
      params = bindings;
    } else {
      // Fallback for any other call style
      sqlStr = String(templateOrSql);
      params = bindings.flat();
    }

    if (sqlStr.includes('WHERE id') && sqlStr.includes('FROM users')) {
      // getMe query: SELECT ... FROM users WHERE id = ?
      const id = String(params[0]);
      const row = String(seededUser.id) === id ? { ...seededUser } : null;
      return Promise.resolve(row ? [row] : []);
    }
    if (sqlStr.includes('WHERE email') && sqlStr.includes('FROM users')) {
      // login query: SELECT ... FROM users WHERE email = ?
      const email = String(params[0]);
      const row = seededUser.email === email ? { ...seededUser } : null;
      return Promise.resolve(row ? [row] : []);
    }
    return Promise.resolve([]);
  });
}

function resetMockState() {
  mockQueryRaw.mockClear();
  mockExecuteRaw.mockClear();
  mockExecuteRaw.mockResolvedValue(1);
  mockRefreshTokenCreate.mockClear();
  mockAuditLogCreate.mockClear();
  mockUserUpdate.mockClear();
}

// ── Load module ONCE ─────────────────────────────────────────────────────
// No jest.doMock or jest.resetModules — we inject mocks via setupTestPrisma.

const { AuthService, setupTestPrisma, resetPrisma } = require('../src/services/auth.service');

function cleanupAfterTest() {
  resetMockState();
  resetPrisma();
}

// ── Login Tests ──────────────────────────────────────────────────────────

describe('AuthService.login — legacy schema compatibility', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    resetMockState();

    const passwordHash = await hashPassword('TestPass123!');
    configureMockForUser(passwordHash, 1);

    // Inject mock BEFORE any service call — getPrisma() will use our mock
    setupTestPrisma(mockPrismaInstance);
  });

  afterEach(() => {
    cleanupAfterTest();
  });

  test('returns tokens for valid credentials', async () => {
    const result = await AuthService.login({ email: 'admin@earnwealth.com', password: 'TestPass123!' });

    expect(result).toBeDefined();
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.id).toBe('1');
    expect(result.user.email).toBe('admin@earnwealth.com');
    expect(result.user.role).toBe('SUPER_ADMIN');
  });

  test('throws INVALID_CREDENTIALS for wrong password', async () => {
    await expect(
      AuthService.login({ email: 'admin@earnwealth.com', password: 'WrongPassword' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.INVALID_CREDENTIALS, statusCode: 401 });
  });

  test('throws INVALID_CREDENTIALS for non-existent email', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await expect(
      AuthService.login({ email: 'nonexistent@test.com', password: 'anything' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.INVALID_CREDENTIALS, statusCode: 401 });
  });

  test('maps isActive=0 to INACTIVE — blocks login with 403', async () => {
    configureMockForUser(seededUser.passwordHash, 0);

    await expect(
      AuthService.login({ email: 'admin@earnwealth.com', password: 'TestPass123!' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.ACCOUNT_INACTIVE, statusCode: 403 });
  });

  test('maps isActive=1 to ACTIVE — login succeeds', async () => {
    configureMockForUser(seededUser.passwordHash, 1);
    const result = await AuthService.login({ email: 'admin@earnwealth.com', password: 'TestPass123!' });
    expect(result.user.role).toBe('SUPER_ADMIN');
  });

  test('persists refresh token when table exists', async () => {
    await AuthService.login({ email: 'admin@earnwealth.com', password: 'TestPass123!' });
    // Sessions are revoked first, then the new token is inserted.
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
  });

  test('does not break login when refresh_tokens table is missing', async () => {
    mockExecuteRaw.mockRejectedValueOnce(new Error('Table refresh_tokens does not exist'));

    const result = await AuthService.login({ email: 'admin@earnwealth.com', password: 'TestPass123!' });
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  test('does not break login when audit_logs table is missing', async () => {
    mockAuditLogCreate.mockRejectedValue(new Error('Table audit_logs does not exist'));

    const result = await AuthService.login({ email: 'admin@earnwealth.com', password: 'TestPass123!' });
    expect(result.accessToken).toBeDefined();
  });

  test('always verifies password — never bypasses it', async () => {
    await expect(
      AuthService.login({ email: 'admin@earnwealth.com', password: 'wrong-password-123' }),
    ).rejects.toMatchObject({ code: AppErrorCodes.INVALID_CREDENTIALS, statusCode: 401 });
  });
});

// ── getMe Tests ──────────────────────────────────────────────────────────

describe('AuthService.getMe — legacy schema compatibility', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    resetMockState();

    const passwordHash = await hashPassword('TestPass123!');
    configureMockForUser(passwordHash, 1);
    setupTestPrisma(mockPrismaInstance);
  });

  afterEach(() => {
    cleanupAfterTest();
  });

  test('returns user profile for valid userId', async () => {
    const result = await AuthService.getMe('1');
    expect(result.id).toBe('1');
    expect(result.email).toBe('admin@earnwealth.com');
    expect(result.role).toBe('SUPER_ADMIN');
    expect(result.profile.name).toBe('Super Admin');
    expect(result.profile.fullName).toBe('Super Admin');
  });

  test('returns 404 for non-existent userId', async () => {
    mockQueryRaw.mockResolvedValue([]);

    await expect(AuthService.getMe('999')).rejects.toMatchObject({
      code: AppErrorCodes.NOT_FOUND,
      statusCode: 404,
    });
  });
});

// ── Parameterized SQL safety ─────────────────────────────────────────────

describe('SQL injection protection', () => {
  test('email is passed as parameter binding, not interpolated', async () => {
    jest.clearAllMocks();
    resetPrisma();

    const passwordHash = await hashPassword('TestPass123!');
    configureMockForUser(passwordHash, 1);
    setupTestPrisma(mockPrismaInstance);

    const maliciousEmail = "admin@earnwealth.com' OR '1'='1";
    try {
      await AuthService.login({ email: maliciousEmail, password: 'anything' });
    } catch {
      // expected — wrong password, but we still verify SQL injection safety
    }

    const calls = mockQueryRaw.mock.calls;
    const userLookupCall = calls.find(call => {
      const sqlStr = Array.isArray(call[0]) ? call[0].join('') : String(call[0]);
      return sqlStr.includes('FROM users') && sqlStr.includes('email');
    });

    expect(userLookupCall).toBeDefined();
    // Prisma $queryRaw tagged template: arg[0] = TemplateStringsArray, arg[1] = first param
    expect(userLookupCall[1]).toBe(maliciousEmail);
  });
});
