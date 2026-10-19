/* Focused check: does an EMPLOYEE token get 403 or 500 on HR-only endpoints? */
const BASE = 'http://localhost:5000/api';
const PWD = process.env.PROBE_PWD || 'EWS@12345';

(async () => {
  const j = (await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'e2e.emp1@earnwealth.com', password: PWD, expectedRole: 'EMPLOYEE' }),
  })).json();
  const tok = j.accessToken;
  console.log('employee token role:', j.user && j.user.role);

  const probes = [
    ['/leaves/pending', 'HR-only, expects 403'],
    ['/compoff/policy', 'what role? expects policy read'],
    ['/leaves/all', 'HR-only, expects 403'],
    ['/wfh/requests/pending', 'HR-only, expects 403'],
    ['/attendance/corrections/pending', 'HR-only, expects 403'],
  ];
  for (const [path, note] of probes) {
    const res = await fetch(BASE + path, { headers: { Authorization: 'Bearer ' + tok } });
    const d = await res.json().catch(() => ({}));
    console.log(String(res.status).padEnd(4) + '  ' + path.padEnd(34) + '  ' + note + '   ' + (d.error ? '-> ' + (d.error.message || '') : ''));
  }
  await fetch(BASE + '/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: j.refreshToken }) }).catch(() => {});
})().catch(e => { console.log('FATAL', String(e).slice(0, 200)); process.exit(1); });
