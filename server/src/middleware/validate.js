const { z } = require('zod');
const { AppError, AppErrorCodes } = require('../errors/AppError');

function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const err = new AppError(AppErrorCodes.VALIDATION_ERROR, 'Validation failed.', 400);
      err.validationErrors = errors;
      throw err;
    }
    req.body = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const err = new AppError(AppErrorCodes.VALIDATION_ERROR, 'Validation failed.', 400);
      err.validationErrors = errors;
      throw err;
    }
    req.query = result.data;
    next();
  };
}

module.exports = { validateBody, validateQuery };
