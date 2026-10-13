const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new transports.Console({
      format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    }),
  ],
});

module.exports = { logger };
