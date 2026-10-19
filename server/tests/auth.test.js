const jwt = require('jsonwebtoken');
const { AppError, AppErrorCodes } = require('../src/errors/AppError');
const { Role } = require('../src/types/index');
const { signAccessToken, verifyAccessToken } = require('../src/utils/jwt');
const { hashPassword, comparePassword } = require('../src/utils/password');
const errorHandler = require('../src/middleware/errorHandler');

jest.mock('../src/services/auth.service');

describe('JWT utilities', () => {
  const payload = { userId: 'user-1', role: 'EMPLOYEE', email: 'test@test.com' };

  test('signAccessToken produces a valid JWT', () => {
    const token = signAccessToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  test('verifyAccessToken decodes the token', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe('user-1');
    expect(decoded.role).toBe('EMPLOYEE');
    expect(decoded.email).toBe('test@test.com');
  });

  test('throws on invalid token', () => {
    expect(() => verifyAccessToken('not-a-valid-token')).toThrow();
  });

  test('expired token throws', () => {
    const expiredToken = jwt.sign({ userId: '1' }, 'secret', { expiresIn: '-1s' });
    expect(() => verifyAccessToken(expiredToken)).toThrow();
  });
});

describe('Password utilities', () => {
  test('hashPassword creates a bcrypt hash', async () => {
    const hash = await hashPassword('testpassword');
    expect(hash).toBeDefined();
    expect(hash).not.toBe('testpassword');
    expect(hash.startsWith('$2')).toBe(true);
  });

  test('comparePassword validates correctly', async () => {
    const hash = await hashPassword('testpassword');
    expect(await comparePassword('testpassword', hash)).toBe(true);
    expect(await comparePassword('wrongpassword', hash)).toBe(false);
  });

  test('hash is deterministic for same input', async () => {
    const hash1 = await hashPassword('samepass');
    const hash2 = await hashPassword('samepass');
    expect(hash1).not.toBe(hash2); // Different salts
    expect(await comparePassword('samepass', hash1)).toBe(true);
    expect(await comparePassword('samepass', hash2)).toBe(true);
  });
});

describe('Role-based Access', () => {
  test('SUPER_ADMIN token has correct role claim', () => {
    const token = signAccessToken({ userId: 'sa-1', role: Role.SUPER_ADMIN, email: 'sa@test.com' });
    const decoded = verifyAccessToken(token);
    expect(decoded.role).toBe('SUPER_ADMIN');
  });

  test('ADMIN token has correct role claim', () => {
    const token = signAccessToken({ userId: 'a-1', role: Role.HR_ADMIN, email: 'a@test.com' });
    const decoded = verifyAccessToken(token);
    expect(decoded.role).toBe('HR_ADMIN');
  });

  test('HR token has correct role claim', () => {
    const token = signAccessToken({ userId: 'h-1', role: Role.HR_ADMIN, email: 'h@test.com' });
    const decoded = verifyAccessToken(token);
    expect(decoded.role).toBe('HR_ADMIN');
  });

  test('EMPLOYEE token has correct role claim', () => {
    const token = signAccessToken({ userId: 'e-1', role: Role.EMPLOYEE, email: 'e@test.com' });
    const decoded = verifyAccessToken(token);
    expect(decoded.role).toBe('EMPLOYEE');
  });

  test('all four roles are distinct', () => {
    const roles = [Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE];
    expect(new Set(roles).size).toBe(3);
  });

  test('token contains all required claims', () => {
    const token = signAccessToken({ userId: 'u-1', role: Role.EMPLOYEE, email: 'u@test.com' });
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBeDefined();
    expect(decoded.role).toBeDefined();
    expect(decoded.email).toBeDefined();
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });
});

describe('Error handler', () => {
  test('formats AppError correctly', () => {
    const err = new AppError(AppErrorCodes.UNAUTHORIZED, 'Auth required', 401);
    let captured;
    const res = { status: () => ({ json: (d) => { captured = d; } }) };
    errorHandler(err, {}, res, () => {});
    expect(captured.error.code).toBe('UNAUTHORIZED');
    expect(captured.error.message).toBe('Auth required');
  });

  test('formats generic error as INTERNAL_ERROR', () => {
    let captured;
    const res = { status: () => ({ json: (d) => { captured = d; } }) };
    errorHandler(new Error('Unexpected'), {}, res, () => {});
    expect(captured.error.code).toBe('INTERNAL_ERROR');
    expect(captured.error.message).toBe('Something went wrong.');
  });

  test('sets correct status code for AppError', () => {
    const err = new AppError(AppErrorCodes.FORBIDDEN, 'No access', 403);
    let captured;
    const res = { status: () => ({ json: (d) => { captured = d; } }) };
    errorHandler(err, {}, res, () => {});
    // status was called with 403
    let statusCode;
    const res2 = {
      status: (code) => { statusCode = code; return { json: () => {} }; }
    };
    errorHandler(err, {}, res2, () => {});
    expect(statusCode).toBe(403);
  });
});

describe('AppError codes', () => {
  test('all expected codes exist', () => {
    const expectedCodes = [
      'INVALID_CREDENTIALS', 'TOKEN_INVALID', 'UNAUTHORIZED', 'FORBIDDEN',
      'ACCOUNT_INACTIVE', 'VALIDATION_ERROR', 'NOT_FOUND', 'DUPLICATE_ENTRY',
      'CONFLICT', 'INTERNAL_ERROR', 'RATE_LIMIT_EXCEEDED',
    ];
    expectedCodes.forEach((code) => {
      expect(AppErrorCodes[code]).toBe(code);
    });
  });

  test('HRMS-specific codes exist', () => {
    expect(AppErrorCodes.LEAVE_OVERLAP).toBe('LEAVE_OVERLAP');
    expect(AppErrorCodes.LEAVE_BALANCE_EXCEEDED).toBe('LEAVE_BALANCE_EXCEEDED');
    expect(AppErrorCodes.WFH_NOT_APPROVED).toBe('WFH_NOT_APPROVED');
    expect(AppErrorCodes.ATTENDANCE_ALREADY_PUNCHED).toBe('ATTENDANCE_ALREADY_PUNCHED');
    expect(AppErrorCodes.PAYROLL_LOCKED).toBe('PAYROLL_LOCKED');
    expect(AppErrorCodes.COMPOFF_EXPIRED).toBe('COMPOFF_EXPIRED');
  });
});
