const { PayrollService } = require('../src/services/payroll.service');

describe('effective-dated statutory payroll calculations', () => {
  test('applies PF from the wage ceiling and retains employer cost separately', async () => {
    const prisma = { payrollStatutorySetting: { findMany: jest.fn().mockResolvedValue([{
      id: 1, statutoryType: 'EPF', stateCode: null, employeeRate: 12, employerRate: 12, wageCeiling: 15000,
    }]) } };
    const result = await PayrollService.applyStatutoryComponents(prisma, { pfApplicable: true }, [{ name: 'Basic Salary', type: 'EARNING', amount: 30000, sortOrder: 1 }], 4, 2026);
    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Provident Fund (Employee)', type: 'DEDUCTION', amount: 1800 }),
      expect.objectContaining({ name: 'Provident Fund (Employer)', type: 'MEMO', amount: 1800 }),
    ]));
  });

  test('does not apply ESI when employee coverage is disabled', async () => {
    const prisma = { payrollStatutorySetting: { findMany: jest.fn().mockResolvedValue([{
      id: 2, statutoryType: 'ESI', stateCode: null, employeeRate: 0.75, employerRate: 3.25, wageCeiling: 21000,
    }]) } };
    const result = await PayrollService.applyStatutoryComponents(prisma, { esiApplicable: false }, [{ name: 'Basic Salary', type: 'EARNING', amount: 20000, sortOrder: 1 }], 4, 2026);
    expect(result.components.find((component) => component.name === 'ESI (Employee)')).toBeUndefined();
  });

  test('prorates earnings only and leaves deductions to statutory calculation', () => {
    const result = PayrollService.prorateEarnings([
      { name: 'Basic Salary', type: 'EARNING', amount: 30000 },
      { name: 'Loan EMI', type: 'DEDUCTION', amount: 1000 },
    ], { prorationFactor: 0.5 });
    expect(result[0].amount).toBe(15000);
    expect(result[1].amount).toBe(1000);
  });
});
