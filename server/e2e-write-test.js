/* WRITE-FLOW TEST using only the e2e.* test accounts.
 * Every row created is tagged to e2e emp ids (15/16) and removed afterwards
 * via id-scoped deletes, so pre-existing rows are never touched.
 */

const { PrismaClient } = require('@prisma/client');
const BASE = 'http://localhost:5000/api';
const PWD = process.env.PROBE_PWD || 'EWS@12345';

const removed = [];
const createdIds = [];

(async () => {
  const p = new PrismaClient();
  const [e1] = await p.$queryRawUnsafe('SELECT id FROM employees WHERE userId = 15');
  const [e2] = await p.$queryRawUnsafe('SELECT id FROM employees WHERE userId = 16');
  const empId = e1.id;
  const otherEmpId = e2.id;
  console.log('e2e emp1 id=' + empId + ', emp2 id=' + otherEmpId);

  // login as employee (e2e.emp1)
  const login = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'e2e.emp1@earnwealth.com', password: PWD, expectedRole: 'EMPLOYEE' }),
  }).then(r => r.json());
  const tok = login.accessToken;
  if (!tok) { console.log('LOGIN FAILED ' + JSON.stringify(login).slice(0, 200)); process.exit(1); }
  const cleanupRt = login.refreshToken;

  const call = async (tag, path, method, body) => {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    console.log(`${String(res.status).padEnd(4)} ${method.padEnd(6)} ${path.padEnd(30)} ${tag} ${d.error ? '-> ' + (d.error.message || '').slice(0, 70) : ''}`);
    return d;
  };

  // ---- punch in with correct contract (employeeId required) ----
  const before = (await p.$queryRawUnsafe(
    'SELECT COUNT(*) c FROM attendance_logs WHERE employeeId = ?', empId))[0].c;
  console.log('\nattendance rows for emp1 before: ' + before);

  await call('punch-in (mine, OFFICE)', '/attendance/punch-in', 'POST', { employeeId: empId, workMode: 'OFFICE' });
  await call('punch-in AGAIN (dup guard)', '/attendance/punch-in', 'POST', { employeeId: empId, workMode: 'OFFICE' });
  await call('punch-out', '/attendance/punch-out', 'POST', { employeeId: empId });
  await call('punch-out AGAIN (dup guard)', '/attendance/punch-out', 'POST', { employeeId: empId });

  // ---- cross-employee access must be denied ----
  await call('punch-in OTHER emp (deny)', '/attendance/punch-in', 'POST', { employeeId: otherEmpId, workMode: 'OFFICE' });
  await call('other emp history (deny)', '/attendance/employees/' + otherEmpId + '/history', 'GET');

  const after = (await p.$queryRawUnsafe(
    'SELECT COUNT(*) c FROM attendance_logs WHERE employeeId = ?', empId))[0].c;
  console.log('attendance rows for emp1 after : ' + after + '  (delta ' + (after - before) + ')');

  // ---- collect created rows for cleanup ----
  const rows = await p.$queryRawUnsafe(
    'SELECT id FROM attendance_logs WHERE employeeId = ? AND punchTime > DATE_SUB(NOW(), INTERVAL 10 MINUTE) ORDER BY id', empId);
  for (const r of rows) {
    try {
      const del = await p.$executeRawUnsafe('DELETE FROM attendance_logs WHERE id = ? AND employeeId = ?', r.id, empId);
      if (del > 0) { removed.push(r.id); console.log('  removed attendance row ' + r.id); }
    } catch (e) { console.log('  remove failed ' + r.id + ': ' + e.message.slice(0, 80)); }
  }
  const finalCount = (await p.$queryRawUnsafe(
    'SELECT COUNT(*) c FROM attendance_logs WHERE employeeId = ?', empId))[0].c;
  console.log('attendance rows for emp1 final : ' + finalCount + '  (restored to original ' + before + ': ' + (finalCount === before) + ')');

  await fetch(BASE + '/auth/logout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: cleanupRt }),
  }).catch(() => {});

  await p.$disconnect();
})().catch(e => { console.log('FATAL', String(e.stack).slice(0, 400)); process.exit(1); });
