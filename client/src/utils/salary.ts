// Client mirror of the server's standard salary split engine
// (server/src/services/payroll.service.js -> standardSalarySplit).
// Used for the live preview on the HR Salary Configuration tab, so the
// numbers update as the rules are typed without a round-trip to the API.

import type { SalaryRules, SalarySplitPreview } from '../services/payroll.service';

export function previewSalarySplitLocal(ctc: number, rules: SalaryRules): SalarySplitPreview {
  const ctcNum = Number(ctc) || 0;
  const round = (n: number) => Math.round(n * 100) / 100;

  const basic = round((ctcNum * (Number(rules.basicPct) || 0)) / 100);
  const hra = round((basic * (Number(rules.hraPctOfBasic) || 0)) / 100);
  const pfBase = Math.min(basic, Number(rules.pfCap) || 0);
  const pfEmployee = round((pfBase * (Number(rules.pfPct) || 0)) / 100);
  const esicBase = Math.min(ctcNum, Number(rules.esicWageCeiling) || 0);
  const esiEmployee = round((esicBase * (Number(rules.esicEmployeePct) || 0)) / 100);
  const esiEmployer = round((esicBase * (Number(rules.esicEmployerPct) || 0)) / 100);
  const pt = Number(rules.professionTax) || 0;

  const special = Math.max(0, round(ctcNum - basic - hra - pfEmployee - esiEmployee - pt));

  const earnings = [
    { name: 'Basic Salary', code: 'BASIC', type: 'EARNING', amount: basic },
    { name: 'House Rent Allowance', code: 'HRA', type: 'EARNING', amount: hra },
    { name: 'Special Allowance', code: 'SPL', type: 'EARNING', amount: special },
  ];
  const deductions = [
    { name: 'Provident Fund (Employee)', code: 'PF', type: 'DEDUCTION', amount: pfEmployee },
    { name: 'ESI (Employee)', code: 'ESI_EMP', type: 'DEDUCTION', amount: esiEmployee },
    { name: 'Profession Tax', code: 'PT', type: 'DEDUCTION', amount: pt },
  ];
  const employerContributions = [
    { name: 'Provident Fund (Employer)', code: 'PF_ER', type: 'MEMO', amount: pfEmployee },
    { name: 'ESI (Employer)', code: 'ESI_ER', type: 'MEMO', amount: esiEmployer },
  ];

  const grossEarnings = round(earnings.reduce((s, c) => s + c.amount, 0));
  const totalDeductions = round(deductions.reduce((s, c) => s + c.amount, 0));

  return {
    ctc: ctcNum,
    earnings,
    deductions,
    employerContributions,
    grossEarnings,
    totalDeductions,
    netPay: round(grossEarnings - totalDeductions),
  };
}
