const { AppError, AppErrorCodes } = require('../errors/AppError');

function errorHandler(err, _req, res, _next) {
  const isApp = err instanceof AppError;
  const statusCode = isApp ? err.statusCode : 500;
  const code = isApp ? err.code : 'INTERNAL_ERROR';
  const message = isApp ? err.message : 'Something went wrong.';

  res.status(statusCode).json({
    error: { code, message },
  });
}

module.exports = errorHandler;
module.exports.AppError = AppError;
module.exports.AppErrorCodes = AppErrorCodes;
