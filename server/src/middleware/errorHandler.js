const { AppError, AppErrorCodes } = require('../errors/AppError');
const { moduleLogger } = require('../utils/logger');

const log = moduleLogger('error-handler');

function errorHandler(err, req, res, _next) {
  // body-parser (express.json / express.urlencoded) throws a SyntaxError with
  // type 'entity.parse.failed' when the request body cannot be parsed. Return
  // a proper 400 instead of a 500 so clients can distinguish malformed bodies
  // from server errors.
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    log.warn('Malformed request body', { method: req.method, path: req.originalUrl });
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request body.' },
    });
    return;
  }

  const isApp = err instanceof AppError;
  const statusCode = isApp ? err.statusCode : 500;
  const code = isApp ? err.code : 'INTERNAL_ERROR';
  const message = isApp ? err.message : 'Something went wrong.';

  // Log it. Operational 4xx (validation, not-found, forbidden) are warnings —
  // a signal worth seeing, not a crash. 5xx and unknown errors are errors with
  // the full stack. Every line carries the request's reqId (via the ambient
  // log context) so the whole chain can be grepped in one pass.
  const logMeta = {
    code,
    status: statusCode,
    method: req.method,
    path: req.originalUrl,
    actor: req.user ? { id: String(req.user.id), role: req.user.role } : null,
    ...(isApp ? {} : { stack: err.stack }),
  };
  if (statusCode >= 500 || !isApp) {
    log.error(`${req.method} ${req.originalUrl} failed: ${message}`, logMeta);
  } else {
    log.warn(`${req.method} ${req.originalUrl} rejected (${code}): ${message}`, logMeta);
  }

  // Zod validation failures carry the per-field issues in `validationErrors`;
  // surface them so the UI can show the specific problem instead of the
  // generic "Validation failed." banner.
  const validationErrors = isApp && err.validationErrors
    ? err.validationErrors
    : undefined;

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(validationErrors ? { validationErrors } : {}),
      // The request id makes "copy this to Claude" self-locating: grep the
      // logs for this reqId to get the full chain.
      reqId: req.id,
    },
  });
}

module.exports = errorHandler;
module.exports.AppError = AppError;
module.exports.AppErrorCodes = AppErrorCodes;
