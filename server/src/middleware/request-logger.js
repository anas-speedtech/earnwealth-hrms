const { randomUUID } = require('node:crypto');
const { enterLogContext, moduleLogger } = require('../utils/logger');

const log = moduleLogger('http');

/**
 * Per-request log context + access lines.
 *
 * - Mints (or reuses the client-supplied) X-Request-Id and enters it into
 *   the logger's AsyncLocalStorage, so EVERY log line written anywhere in
 *   that request's flow — services, middleware, the error handler — is
 *   tagged with the same reqId. To follow a chain: copy one reqId and
 *   grep `logs/app.log` for it; the full story of that request shows.
 * - Writes one access line when the response finishes:
 *   INFO 4xx, WARN 4xx, ERROR 5xx, with duration + actor + remote ip.
 * - Health checks are skipped (they would drown the real signal).
 */
function requestLogger(req, res, next) {
  const reqId = String(req.headers['x-request-id'] || '').trim() || randomUUID();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);

  // Attach the ambient context BEFORE anything in the request can log.
  enterLogContext({ reqId, module: 'http' });

  if (req.path === '/api/health') {
    return next();
  }

  const startedAt = Date.now();
  const remoteIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;

  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    const status = res.statusCode;
    const base = {
      method: req.method,
      path: req.originalUrl || req.url,
      status,
      ms,
      ip: remoteIp,
      actor: req.user ? { id: String(req.user.id), role: req.user.role, email: req.user.email } : null,
    };
    if (status >= 500) log.error(`${req.method} ${req.originalUrl} → ${status}`, base);
    else if (status >= 400) log.warn(`${req.method} ${req.originalUrl} → ${status}`, base);
    else log.info(`${req.method} ${req.originalUrl} → ${status}`, base);
  });

  next();
}

module.exports = requestLogger;
