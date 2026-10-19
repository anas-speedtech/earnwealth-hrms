// Tests the audit log endpoint using the real server over HTTP.
//
// Usage: node test-audit.js <password>

require('dotenv').config();

const password = process.argv[2];
if (!password) {
  console.error('usage: node test-audit.js <your-password>');
  process.exit(1);
}

const BASE = 'http://localhost:5000/api';

async function post(path, body, token) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function get(path, token) {
  const res = await fetch(BASE + path, {
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not json */
  }
  return { status: res.status, data };
}

(async () => {
  console.log('1. login...');
  const login = await post('/auth/login', { email: 'admin@earnwealth.com', password });
  if (login.status !== 200) {
    console.log('   FAIL: login returned HTTP ' + login.status + ' — ' + JSON.stringify(login.data));
    process.exit(1);
  }
  const token = login.data.accessToken;
  console.log('   OK  role=' + login.data.user.role);

  console.log('');
  console.log('2. /api/audit-logs (no auth — expect 401)...');
  const noauth = await get('/audit-logs');
  console.log('   HTTP ' + noauth.status + (noauth.status === 401 ? ' (correct)' : ' (WRONG — should be 401)'));

  console.log('');
  console.log('3. /api/audit-logs with auth...');
  const list = await get('/audit-logs', token);
  console.log('   HTTP ' + list.status);
  if (list.data && list.data.data) {
    const d = list.data.data;
    console.log('   total rows : ' + d.pagination.total);
    console.log('   this page  : ' + d.logs.length);
    if (d.logs.length > 0) {
      const r = d.logs[0];
      console.log('   newest row : ' + r.action + ' / ' + r.entityType + ' / ' + r.actorRole + ' / ' + r.createdAt);
    }
  } else {
    console.log('   ' + JSON.stringify(list.data).slice(0, 120));
  }

  console.log('');
  console.log('4. /api/audit-logs/filters...');
  const filters = await get('/audit-logs/filters', token);
  console.log('   HTTP ' + filters.status);
  if (filters.data && filters.data.data) {
    console.log('   actions     : ' + filters.data.data.actions.join(', '));
    console.log('   entityTypes : ' + filters.data.data.entityTypes.join(', '));
  }

  const pass = noauth.status === 401 && list.status === 200 && filters.status === 200;
  console.log('');
  console.log(pass ? 'PASS: audit logs endpoint works end to end.' : 'FAIL: see above.');
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error('ERR: ' + e.message);
  process.exit(1);
});
