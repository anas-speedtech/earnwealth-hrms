/* DIRECT SERVICE-LEVEL PROBE (read-only): call the failing handlers' service
 * functions with their REAL signatures to surface the actual error instead of
 * the generic "Something went wrong." 500. No login, no HTTP.
 */
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const BASE = 'C:/Users/ARYA/Desktop/EWS-HRMS1/server/src';
const p = new PrismaClient();
const HRUSER = { id: 7, role: 'HR', email: 'e2e.hr1@earnwealth.com' };
const EMPUSER = { id: 15, role: 'EMPLOYEE', email: 'e2e.emp1@earnwealth.com' };

(async () => {
  const { LeaveService } = require(path.join(BASE, 'services/leave.service.js'));
  const check = async (label, fn) => {
    try {
      const out = await fn();
      console.log('  OK   ' + label + ' -> ' + (Array.isArray(out) ? 'array(' + out.length + ')' : typeof out));
    } catch (e) {
      console.log('  FAIL ' + label + ' -> [' + e.name + '] ' + String(e.message).slice(0, 220));
    }
  };

  console.log('=== LeaveService (all read-only) ===');
  await check('listLeaveTypes()', () => LeaveService.listLeaveTypes());
  await check('getPendingRequests(HR)', () => LeaveService.getPendingRequests(HRUSER));
  await check('getMyBalances(EMP, 9)', () => LeaveService.getMyBalances(EMPUSER, 9));
  await check('getRequests(p,EMP,{})(HR)', () => LeaveService.getRequests(p, HRUSER, {}));

  // the compoff employeeProfile bug, reproduced directly
  console.log('\n=== prisma.employeeProfile (the missing delegate) ===');
  await check('prisma.employeeProfile.findUnique', () => p.employeeProfile.findUnique({ where: { userId: 15 } }));

  await p.$disconnect();
})().catch(e => { console.log('FATAL', String(e.stack).slice(0, 400)); process.exit(1); });
