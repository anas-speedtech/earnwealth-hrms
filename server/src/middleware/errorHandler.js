const { AppError, AppErrorCodes } = require('../errors/AppError');

function errorHandler(err, _req, res, _next) {
  // body-parser (express.json / express.urlencoded) throws a SyntaxError with
  // type 'entity.parse.failed' when the request body cannot be parsed. Return
  // a proper 400 instead of a 500 so clients can distinguish malformed bodies
  // from server errors.
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body.' },
    });
    return;
  }

  const isApp = err instanceof AppError;
  const statusCode = isApp ? err.statusCode : 500;
  const code = isApp ? err.code : 'INTERNAL_ERROR';
  const message = isApp ? err.message : 'Something went wrong.';

  // Zod validation failures carry the per-field issues in `validationErrors`;
  // surface them so the UI can show the specific problem instead of the
  // generic "Validation failed." banner.
  const validationErrors = isApp && err.validationErrors
    ? err.validationErrors
    : undefined;

  res.status(statusCode).json({
    error: { code, message, ...(validationErrors ? { validationErrors } : {}) },
  });
}

module.exports = errorHandler;
module.exports.AppError = AppError;
module.exports.AppErrorCodes = AppErrorCodes;
