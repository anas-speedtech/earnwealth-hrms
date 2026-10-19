require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const url =
  'mysql://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' +
  process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME;
const p = new PrismaClient({ datasources: { db: { url } } });

(async () => {
  const want = process.argv.slice(2);
  for (const t of want) {
    try {
      const c = await p.$queryRawUnsafe('SELECT COUNT(*) n FROM `' + t + '`');
      const cols = await p.$queryRawUnsafe(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='" + t + "' ORDER BY ORDINAL_POSITION"
      );
      console.log('  OK  ' + t.padEnd(22) + c[0].n + ' rows');
      if (cols.length) console.log('      cols: ' + cols.map((x) => x.COLUMN_NAME).join(', '));
    } catch (e) {
      console.log('  MISSING  ' + t);
    }
  }
  await p.$disconnect();
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
