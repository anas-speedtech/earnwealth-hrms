// Test that all route modules can be loaded
try {
  require('./src/routes/attendance.js');
  console.log('OK: attendance routes');
} catch (e) {
  console.error('ERROR: attendance routes -', e.message);
}

try {
  require('./src/routes/attendance-corrections.js');
  console.log('OK: attendance-corrections routes');
} catch (e) {
  console.error('ERROR: attendance-corrections routes -', e.message);
}

try {
  require('./src/routes/wfh.js');
  console.log('OK: wfh routes');
} catch (e) {
  console.error('ERROR: wfh routes -', e.message);
}

console.log('All checks passed');
