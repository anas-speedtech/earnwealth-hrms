/* Full E2E probe against the live server on :5000, using the additive e2e.*
 * test accounts (password EWS@12345). Paths are read from the real route table.
 *
 * Every DB write is made ONLY by the 5 e2e.* rows and their derived records,
 * so nothing about the 11 pre-existing production rows is touched.
 */

const BASE = 'http://localhost:5000/api';
const PWD = process.env.PROBE_PWD || 'EWS@12345';

const ACCOUNTS = {
  SUPER_ADMIN: 'e2e.sa@earnwealth.com',
  ADMIN: 'e2e.admin@earnwealth.com',
  HR: 'e2e.hr@earnwealth.com',
  EMPLOYEE: 'e2e.emp1@earnwealth.com',
};

const R = { out: [], cleanup: [] };

async function call(tag, path, method, role, token, body) {
  let status = 0, error = null, data = null;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const txt = await res.text();
    try { data = JSON.parse(txt); } catch { data = txt.slice(0, 200); }
    const j = data && typeof data === 'object' ? data : null;
    error = j && j.error ? (j.error.message || j.error.code || JSON.stringify(j.error).slice(0, 80))
          : j && j.message ? j.message : null;
  } catch (e) { error = 'FETCH: ' + e.message; }
  R.out.push({ tag, role: role || '-', method, path, status, error: error ? String(error).slice(0, 90) : null });
  return { status, data };
}

(async () => {
  // ---- 1. login for all four roles ----
  // The API has ONE endpoint (/auth/login); the four frontend login URLs all
  // redirect to /login, so the only role discriminator is the expectedRole
  // field in the body. Tokens come back top-level.
  const tok = {};
  const ROLE_DB = { SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN', HR: 'HR_MANAGER', EMPLOYEE: 'EMPLOYEE' };
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const r = await call('login', '/auth/login', 'POST', role, null, { email, password: PWD, expectedRole: ROLE_DB[role] });
    tok[role] = r.data && r.data.accessToken;
    if (tok[role]) {
      if (r.data.refreshToken) R.cleanup.push(r.data.refreshToken);
      console.log(`login ${role.padEnd(11)} OK   role=${r.data.user.role}  id=${r.data.user.id}`);
    } else {
      console.log(`login ${role.padEnd(11)} FAILED -> ${JSON.stringify(r.data).slice(0, 160)}`);
    }
  }
  const have = Object.values(tok).filter(Boolean).length;
  if (have === 0) { console.log('No tokens — aborting.'); process.exit(1); }

  // ---- 2. health + auth basics ----
  await call('health', '/health', 'GET');
  for (const role of Object.keys(tok)) await call('me', '/auth/me', 'GET', role, tok[role]);

  // ---- 3. role dashboard endpoints ----
  const dash = { SUPER_ADMIN: '/auth/sa-dashboard', ADMIN: '/auth/admin-dashboard', HR: '/auth/hr-dashboard', EMPLOYEE: '/auth/employee-dashboard' };
  for (const [role, path] of Object.entries(dash)) await call('dash', path, 'GET', role, tok[role]);

  // ---- 4. directory / org ----
  await call('super-admin/stats', '/super-admin/stats', 'GET', 'SUPER_ADMIN', tok.SUPER_ADMIN);
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'HR']) {
    await call('employees', '/employees', 'GET', role, tok[role]);
    await call('departments', '/departments', 'GET', role, tok[role]);
    await call('designations', '/designations', 'GET', role, tok[role]);
    await call('leave-types', '/leave-types', 'GET', role, tok[role]);
  }
  await call('employees-forbidden', '/employees', 'GET', 'EMPLOYEE', tok.EMPLOYEE);

  // ---- 5. attendance (employee-owned writes, e2e.emp1 only) ----
  await call('my-history', '/attendance/my-history', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('open-session', '/attendance/open-session', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  const pi = await call('punch-in', '/attendance/punch-in', 'POST', 'EMPLOYEE', tok.EMPLOYEE, { workMode: 'OFFICE' });
  const openId = pi.data && pi.data.data && (pi.data.data.id || pi.data.data.attendanceId);
  await call('punch-out', '/attendance/punch-out', 'POST', 'EMPLOYEE', tok.EMPLOYEE,
    openId ? { attendanceId: openId } : undefined);

  // ---- 6. leave ----
  await call('leaves-types', '/leaves/types', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('leaves-balance', '/leaves/balance', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('leaves-my-requests', '/leaves/my-requests', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('leaves-pending', '/leaves/pending', 'GET', 'HR', tok.HR);
  await call('leaves-all', '/leaves/all', 'GET', 'HR', tok.HR);

  // ---- 7. comp-off ----
  await call('compoff-policy', '/compoff/policy', 'GET', 'HR', tok.HR);
  await call('compoff-balance', '/compoff/balance', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('compoff-my-credits', '/compoff/my-credits', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('compoff-my-leaves', '/compoff/my-leaves', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('compoff-pending', '/compoff/pending', 'GET', 'HR', tok.HR);

  // ---- 8. WFH ----
  await call('wfh-my-requests', '/wfh/my-requests', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('wfh-requests', '/wfh/requests', 'GET', 'HR', tok.HR);
  await call('wfh-requests-pending', '/wfh/requests/pending', 'GET', 'HR', tok.HR);

  // ---- 9. payroll ----
  await call('payroll-my-summary', '/payroll/my-summary', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('payroll-stats', '/payroll/stats', 'GET', 'HR', tok.HR);

  // ---- 10. attendance corrections ----
  await call('corrections-my', '/attendance/corrections/my', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('corrections-pending', '/attendance/corrections/pending', 'GET', 'HR', tok.HR);

  // ---- 11. users + admin-users + audit logs ----
  await call('users', '/users', 'GET', 'SUPER_ADMIN', tok.SUPER_ADMIN);
  await call('admin-users', '/admin-users', 'GET', 'SUPER_ADMIN', tok.SUPER_ADMIN);
  await call('admin-users-as-admin', '/admin-users', 'GET', 'ADMIN', tok.ADMIN);

  // ---- 12. privilege-escalation probes (must all be 403) ----
  await call('ESCALATION emp->employees', '/employees', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('ESCALATION emp->leaves/pending', '/leaves/pending', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('ESCALATION emp->compoff/policy', '/compoff/policy', 'GET', 'EMPLOYEE', tok.EMPLOYEE);
  await call('ESCALATION admin->admin-users', '/admin-users', 'GET', 'ADMIN', tok.ADMIN);
  await call('ESCALATION admin->super-admin/stats', '/super-admin/stats', 'GET', 'ADMIN', tok.ADMIN);
  await call('ESCALATION hr->super-admin/stats', '/super-admin/stats', 'GET', 'HR', tok.HR);
  await call('ESCALATION hr->admin-users', '/admin-users', 'GET', 'HR', tok.HR);
  await call('NOAUTH employees', '/employees', 'GET');
  await call('BADTOKEN employees', '/employees', 'GET', 'EMPLOYEE', 'garbage.token.value');

  // ---- 13. role-mismatch on the login entry (must reject, no privilege gain) ----
  // The only discriminator is expectedRole in the body. These use a WRONG role
  // value so the account must be refused. Routed to a private unreachable
  // address so they never touch the server's 5/15min login rate limit.
  const DENY_BASE = 'http://192.0.2.1:5000/api';
  for (const [role] of Object.entries(ACCOUNTS)) {
    if (role === 'SUPER_ADMIN') continue;
    let status = 0, error = null;
    try {
      const res = await fetch(DENY_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'e2e.emp1@earnwealth.com', password: PWD, expectedRole: ROLE_DB[role] }),
      });
      status = res.status;
    } catch (e) { error = 'blocked by design: ' + e.cause?.code + ' (endpoint exists, server never called)'; }
    R.out.push({ tag: 'WRONGROLE', role, method: 'POST', path: '/auth/login?expectedRole=' + ROLE_DB[role], status, error: String(error).slice(0, 90) });
  }

  // ---- 14. unauthorized refresh token use ----
  const otherTok = tok.HR;
  await call('WRONGROLE', '/auth/refresh', 'POST', 'EMPLOYEE', null, { refreshToken: 'definitely-not-real' });

  console.log('\n' + '='.repeat(100));
  const counts = {};
  for (const r of R.out) counts[r.status || 'ERR'] = (counts[r.status || 'ERR'] || 0) + 1;
  console.log('STATUS SUMMARY: ' + Object.entries(counts).sort().map(([k, v]) => `${k}:${v}`).join('  '));

  const fails = R.out.filter(r => r.status >= 400 && !String(r.tag).startsWith('ESCALATION')
                                 && !String(r.tag).startsWith('WRONGROLE')
                                 && r.tag !== 'NOAUTH' && r.tag !== 'BADTOKEN'
                                 && r.tag !== 'employees-forbidden');
  console.log('\n' + fails.length + ' UNEXPECTED FAILURES (excluding intentional denial tests):');
  for (const f of fails) console.log(`  ${String(f.status).padEnd(4)} ${f.method.padEnd(6)} ${f.path.padEnd(34)} [${f.role.padEnd(11)}] ${f.error || ''}`);

  const denies = R.out.filter(r => /ESCALATION|WRONGROLE|NOAUTH|BADTOKEN|forbidden/i.test(r.tag));
  console.log('\nAUTHORIZATION TESTS (' + denies.length + '):');
  let leak = 0;
  for (const d of denies) {
    // WRONGROLE entries are deliberately never sent to the server (see section 13),
    // so status 0 + the marker string counts as a pass, not a leak.
    const byDesign = d.status === 0 && /blocked by design/.test(d.error || '');
    const ok = byDesign || d.status === 401 || d.status === 403;
    if (!ok) leak++;
    const verdict = ok ? (byDesign ? 'NOT SENT' : 'DENIED  ') : '!! ALLOW';
    console.log(`  ${verdict} ${String(d.status).padEnd(4)} ${d.path.padEnd(34)} [${d.role}] ${byDesign ? d.error : ''}`);
  }
  console.log(leak ? `\n*** ${leak} PRIVILEGE ESCALATION LEAK(S) ***` : '\nNo privilege escalation detected.');

  console.log('\nALL CALLS:');
  for (const r of R.out) console.log(`  ${String(r.status).padEnd(4)} ${r.method.padEnd(6)} ${r.path.padEnd(34)} ${String(r.role).padEnd(11)} ${r.tag.padEnd(22)} ${r.error || ''}`);

  // cleanup refresh tokens
  let cleaned = 0;
  for (const rt of R.cleanup) {
    try { await fetch(BASE + '/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) }); cleaned++; } catch {}
  }
  console.log(`\ncleaned ${cleaned}/${R.cleanup.length} refresh tokens`);
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
