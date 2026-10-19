const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { verifyAccessToken } = require('../utils/jwt');
const { logger } = require('../utils/logger');

function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(AppErrorCodes.UNAUTHORIZED, 'Authentication required.', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.userId,
      role: decoded.role === 'HR_ADMIN' ? 'HR_ADMIN' : decoded.role,
      email: decoded.email,
    };
    next();
  } catch {
    throw new AppError(AppErrorCodes.TOKEN_INVALID, 'Invalid or expired token.', 401);
  }
}

function authorize(...allowedRoles) {
  return function roleCheck(req, _res, next) {
    if (!req.user) {
      throw new AppError(AppErrorCodes.UNAUTHORIZED, 'Authentication required.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Authorization denied', {
        userId: req.user.id,
        role: req.user.role,
        endpoint: `${req.method} ${req.path}`,
        allowedRoles,
      });
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to access this resource.', 403);
    }

    next();
  };
}

module.exports = { authenticate, authorize, Role, AppErrorCodes };
