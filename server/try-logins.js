/* Tries a small set of common default passwords against the existing accounts.
 * No DB writes of our own; a successful login creates a refresh token which we
 * immediately revoke via the normal logout endpoint. */

const BASE = 'http://localhost:5000/api';

const TARGETS = [
  ['SUPER_ADMIN', 'admin@earnwealth.com'],
  ['ADMIN', 'test.admin@earnwealth.com'],
  ['HR', 'hr@earnwealth.com'],
  ['EMPLOYEE', 'emp-1001@earnwealth.com'],
];

const CANDIDATES = [
  'EWS@12345', 'Admin@123', 'admin@123', 'Password@123', 'password123',
  'EWS@2026', 'EWS@2025', 'Ews@123', 'Test@123', 'test@123', 'Ews1234',
  'Emp@1234', 'EMP@123', 'Employee@123', 'hr@1234', 'HR@1234', 'Welcome@123',
  'Changeme@123', 'changeme', 'Admin@1234', 'admin123', 'Default@123',
];

(async () => {
  for (const [role, email] of TARGETS) {
    const url = BASE + `/auth/${role.toLowerCase()}/login`;
    for (const pwd of CANDIDATES) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pwd }),
      });
      if (res.status === 200) {
        const j = await res.json();
        const rt = j.data && j.data.refreshToken;
        if (rt) {
          await fetch(BASE + '/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });
        }
        console.log(`FOUND  ${role.padEnd(12)} ${email.padEnd(28)} password="${pwd}"`);
      } else {
        const j = await res.json().catch(() => ({}));
        const m = j.error ? j.error.message : `HTTP ${res.status}`;
        // Only print a single status line per target to avoid noise.
        if (pwd === CANDIDATES[0]) console.log(`       ${role.padEnd(12)} ${email.padEnd(28)} first-try: ${m.slice(0, 50)}`);
      }
    }
  }
  console.log('\ndone');
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
