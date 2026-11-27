const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, errors } = format;
const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Central logging for the API.
 *
 * Line shape (identical on console and in logs/app.log):
 *
 *   2026-11-27 14:02:11.482 [ERROR] (req=a1b2c3d4) [services.payroll] Something broke {"code":"X","stack":"..."}
 *
 *   - ISO-ish timestamp (ms precision)
 *   - level
 *   - reqId — the request context id, when the line was written inside a
 *     request (set by the request-logger middleware via AsyncLocalStorage,
 *     so every service log in that request carries it; copy one reqId and
 *     grep to reconstruct the whole chain)
 *   - module — the child logger's name (services.payroll, middleware.auth,
 *     http, error-handler, app)
 *   - message + the structured meta object, JSON-serialized
 *
 * File output: `logs/app.log` (everything) and `logs/error.log` (error-level
 * only — the first place to look when something broke). Both are plain
 * append files; the app self-rotates app.log on startup when it passes the
 * 10 MB cap (one generation, .1), which is enough for PM2-restarted processes
 * and keeps the box's disk bounded without adding a dependency.
 */

// Resolve the log dir from the working directory so it lands in one place
// for dev (tsx from server/) and production (PM2 node dist/src/index.js).
// Override with LOG_DIR if the box wants it elsewhere.
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

// Rotate on startup: app.log bigger than the cap → move to app.log.1 (the
// previous .1 is dropped). One generation on purpose: the live file is what
// matters for debugging; the older copy is a safety net, not an archive.
function rotateIfNeeded(file, maxBytes) {
  try {
    const stats = fs.statSync(file);
    if (stats.size > maxBytes) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch {
    /* file absent or not stat-able — nothing to rotate */
  }
}

const APP_LOG = path.join(LOG_DIR, 'app.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');
const APP_LOG_MAX_BYTES = 10 * 1024 * 1024;

// One AsyncLocalStorage instance shared by the whole process: the request
// middleware enterWith()s a context per request, and every subsequent log
// line written inside that request's async flow (services, awaits, callbacks)
// sees it. Concurrent requests never mix.
const logStore = new AsyncLocalStorage();

/** Attach a log context (reqId / method / path / …) to this request's flow. */
function enterLogContext(context) {
  if (context) logStore.enterWith(context);
}

/** The ambient log context, if any (used to enrich every record). */
function getLogContext() {
  return logStore.getStore();
}

const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const recordFormatter = printf(({ level, message, timestamp, module, reqId, ...meta }) => {
  const context = getLogContext() || {};
  const ctxReqId = context.reqId || reqId;
  const moduleTag = module || context.module || 'app';

  // An Error object passed as meta: inline its stack so nothing is lost.
  let metaJson = '';
  const metaEntries = Object.entries(meta);
  if (metaEntries.length) {
    const printable = {};
    for (const [key, value] of metaEntries) {
      if (value instanceof Error) {
        printable[key] = { message: value.message, stack: value.stack };
      } else {
        printable[key] = value;
      }
    }
    metaJson = ` ${JSON.stringify(printable)}`;
  }

  const reqIdTag = ctxReqId ? ` (req=${ctxReqId})` : '';
  return `${timestamp} [${String(level).toUpperCase()}]${reqIdTag} [${moduleTag}] ${message}${metaJson}`;
});

const logFormat = combine(
  errors({ stack: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  recordFormatter,
);

const consoleFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  recordFormatter,
);

const fileDirOk = ensureLogDir();
if (fileDirOk) {
  rotateIfNeeded(APP_LOG, APP_LOG_MAX_BYTES);
  rotateIfNeeded(ERROR_LOG, 5 * 1024 * 1024);
}

const baseLogger = createLogger({
  level: logLevel,
  // Console is what `pm2 logs` shows; the files are what you copy-paste.
  transports: [
    new transports.Console({ format: consoleFormat, handleExceptions: true }),
    ...(fileDirOk
      ? [
        new transports.File({ filename: APP_LOG, format: logFormat }),
        new transports.File({ filename: ERROR_LOG, level: 'error', format: logFormat }),
      ]
      : []),
  ],
});

/**
 * A child logger that stamps `module` on every record it writes. Services
 * do `const logger = moduleLogger('services.payroll')` and keep calling
 * logger.info/warn/error exactly as before — only the tag changes.
 */
function moduleLogger(moduleName) {
  return baseLogger.child({ module: moduleName });
}

// The plain export keeps working for any caller that hasn't been migrated;
// those lines just tag as [app].
const logger = baseLogger;

module.exports = {
  logger,
  moduleLogger,
  enterLogContext,
  getLogContext,
  // Exposed for tests / the request logger.
  LOG_DIR,
};
