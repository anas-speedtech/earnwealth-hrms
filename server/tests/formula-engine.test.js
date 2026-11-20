const { PayrollFormulaEngine } = require('../src/services/formula-engine');

describe('PayrollFormulaEngine', () => {
  test('evaluates controlled arithmetic and percentages', () => {
    expect(PayrollFormulaEngine.evaluate('BASIC * 50% + 100', { BASIC: 20000 })).toBe(10100);
  });

  test('does not execute arbitrary JavaScript', () => {
    expect(() => PayrollFormulaEngine.evaluate('process.exit(1)', {})).toThrow(/Invalid character|Unknown component/);
  });

  test('finds formula dependencies', () => {
    expect(PayrollFormulaEngine.dependencies('BASIC + HRA + MONTHLY_CTC')).toEqual(['BASIC', 'HRA']);
  });
});
