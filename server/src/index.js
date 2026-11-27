const { env } = require('./config/env');
const app = require('./app');
const { moduleLogger } = require('./utils/logger');

const log = moduleLogger('app');
const PORT = env.PORT;

app.listen(PORT, () => {
  log.info('API started', {
    port: PORT,
    env: env.NODE_ENV,
    logDir: process.env.LOG_DIR || null, // null = <cwd>/logs
  });
});

// Uncaught exceptions / unhandled rejections log a full error before the
// process dies, so `logs/error.log` always says why.
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception — process will exit', { err });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection', { reason });
});

module.exports = app;
