const jwt = require('jsonwebtoken');
const { AppError, AppErrorCodes } = require('../src/errors/AppError');

const { loginLimiter, apiLimiter, passwordResetLimiter } = require('../src/middleware/rateLimiter');
const { validateBody } = require('../src/middleware/validate');

describe('AppError', () => {
  test('creates error with correct properties', () => {
    const err = new AppError(AppErrorCodes.INVALID_CREDENTIALS, 'Bad creds', 401);
    expect(err.code).toBe(AppErrorCodes.INVALID_CREDENTIALS);
    expect(err.message).toBe('Bad creds');
    expect(err.statusCode).toBe(401);
    expect(err.isOperational).toBe(true);
  });

  test('defaults to 400 status', () => {
    const err = new AppError(AppErrorCodes.VALIDATION_ERROR, 'Bad input');
    expect(err.statusCode).toBe(400);
  });
});

describe('Rate Limiters', () => {
  test('loginLimiter is a function middleware', () => {
    expect(loginLimiter).toBeDefined();
    expect(typeof loginLimiter).toBe('function');
  });

  test('apiLimiter is a function middleware', () => {
    expect(apiLimiter).toBeDefined();
    expect(typeof apiLimiter).toBe('function');
  });

  test('passwordResetLimiter is a function middleware', () => {
    expect(passwordResetLimiter).toBeDefined();
    expect(typeof passwordResetLimiter).toBe('function');
  });
});

describe('Validation Middleware', () => {
  test('passes valid body through', () => {
    const schema = { safeParse: () => ({ success: true, data: { email: 'a@b.com' } }) };
    const middleware = validateBody(schema);
    const req = { body: {} };
    const next = jest.fn();
    middleware(req, {}, next);
    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ email: 'a@b.com' });
  });

  test('throws validation error on bad input', () => {
    const issues = [{ path: ['email'], message: 'Invalid email' }];
    const schema = { safeParse: () => ({ success: false, error: { issues } }) };
    const middleware = validateBody(schema);
    const req = { body: {} };
    expect(() => middleware(req, {}, () => {})).toThrow(AppError);
  });
});

describe('JWT utilities', () => {
  const payload = { userId: 'user-1', role: 'EMPLOYEE', email: 'test@test.com' };

  test('signAccessToken produces a valid JWT', () => {
    const { signAccessToken } = require('../src/utils/jwt');
    const token = signAccessToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  test('verifyAccessToken decodes the token', () => {
    const { signAccessToken, verifyAccessToken } = require('../src/utils/jwt');
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe('user-1');
    expect(decoded.role).toBe('EMPLOYEE');
    expect(decoded.email).toBe('test@test.com');
  });

  test('throws on invalid token', () => {
    expect(() => {
      require('../src/utils/jwt').verifyAccessToken('not-a-valid-token');
    }).toThrow();
  });
});

describe('Password utilities', () => {
  test('hashPassword creates a bcrypt hash', async () => {
    const { hashPassword } = require('../src/utils/password');
    const hash = await hashPassword('testpassword');
    expect(hash).toBeDefined();
    expect(hash).not.toBe('testpassword');
    expect(hash.startsWith('$2')).toBe(true);
  });

  test('comparePassword validates correctly', async () => {
    const { hashPassword, comparePassword } = require('../src/utils/password');
    const hash = await hashPassword('testpassword');
    expect(await comparePassword('testpassword', hash)).toBe(true);
    expect(await comparePassword('wrongpassword', hash)).toBe(false);
  });
});
