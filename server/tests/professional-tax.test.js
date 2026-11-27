const { computePT, matchSlab, resolveCategory, exemptionActive, ProfessionalTaxService } = require('../src/services/professional-tax.service');
const { PayrollService } = require('../src/services/payroll.service');

// Maharashtra slabs, effective 01-04-2023 (as amended 2023/2026).
const MH_MALE = [
  { id: 1, employeeCategory: 'MALE', minimumSalary: 0, maximumSalary: 7500, normalTaxAmount: 0, februaryTaxAmount: 0, ruleVersion: 'MH-2023' },
  { id: 2, employeeCategory: 'MALE', minimumSalary: 7501, maximumSalary: 10000, normalTaxAmount: 175, februaryTaxAmount: 175, ruleVersion: 'MH-2023' },
  { id: 3, employeeCategory: 'MALE', minimumSalary: 10001, maximumSalary: null, normalTaxAmount: 200, februaryTaxAmount: 300, ruleVersion: 'MH-2023' },
];
const MH_FEMALE = [
  { id: 4, employeeCategory: 'FEMALE', minimumSalary: 0, maximumSalary: 25000, normalTaxAmount: 0, februaryTaxAmount: 0, ruleVersion: 'MH-2023' },
  { id: 5, employeeCategory: 'FEMALE', minimumSalary: 25001, maximumSalary: null, normalTaxAmount: 200, februaryTaxAmount: 300, ruleVersion: 'MH-2023' },
];

describe('Professional Tax — male slabs (MH, eff. 2023-04-01)', () => {
  const pt = (salary, isFebruary = false) => computePT({ slabs: MH_MALE, salary, category: 'MALE', stateCode: 'MH', isFebruary });
  test('salary 7500 => PT 0', () => expect(pt(7500).finalPT).toBe(0));
  test('salary 7501 => PT 175', () => expect(pt(7501).finalPT).toBe(175));
  test('salary 10000 => PT 175 (upper boundary inclusive)', () => expect(pt(10000).finalPT).toBe(175));
  test('salary 10001 => PT 200', () => expect(pt(10001).finalPT).toBe(200));
  test('salary 50000 in January => PT 200', () => expect(pt(50000, false).finalPT).toBe(200));
  test('salary 50000 in February => PT 300', () => expect(pt(50000, true).finalPT).toBe(300));
  test('february adjustment is +100 on the top male slab', () => expect(pt(50000, true).februaryAdjustment).toBe(100));
});

describe('Professional Tax — female slabs (MH)', () => {
  const pt = (salary, isFebruary = false) => computePT({ slabs: MH_FEMALE, salary, category: 'FEMALE', stateCode: 'MH', isFebruary });
  test('salary 25000 => PT 0', () => expect(pt(25000).finalPT).toBe(0));
  test('salary 25001 => PT 200', () => expect(pt(25001).finalPT).toBe(200));
  test('salary 50000 in January => PT 200', () => expect(pt(50000, false).finalPT).toBe(200));
  test('salary 50000 in February => PT 300', () => expect(pt(50000, true).finalPT).toBe(300));
});

describe('Professional Tax — boundary & edge conditions', () => {
  test('gap rounding: salary 7500.5 rounds up into the 7501 band (never understate)', () => {
    const r = computePT({ slabs: MH_MALE, salary: 7500.5, category: 'MALE', stateCode: 'MH' });
    expect(r.finalPT).toBe(175);
  });
  test('zero / negative salary is not an exemption — it is a skip with no state', () => {
    const r = computePT({ slabs: [], salary: 0, category: null, stateCode: null });
    expect(r.finalPT).toBe(0);
    expect(r.skipped).toBe(true);
  });
  test('no state code => skipped (never assume Maharashtra)', () => {
    const r = computePT({ slabs: MH_MALE, salary: 50000, category: 'MALE', stateCode: null });
    expect(r.finalPT).toBe(0);
    expect(r.skipReason).toBe('NO_STATE');
  });
  test('no category (state set, but no maintained category) => skipped, not guessed', () => {
    const r = computePT({ slabs: [], salary: 50000, category: null, stateCode: 'MH' });
    expect(r.skipReason).toBe('NO_CATEGORY');
  });
  test('February of a zero-PT month adds nothing (0 -> 0)', () => {
    const r = computePT({ slabs: MH_MALE, salary: 5000, category: 'MALE', stateCode: 'MH', isFebruary: true });
    expect(r.finalPT).toBe(0);
    expect(r.februaryAdjustment).toBe(0);
  });
});

describe('Professional Tax — exemptions', () => {
  const slab = { id: 3, employeeCategory: 'MALE', minimumSalary: 10001, maximumSalary: null, normalTaxAmount: 200, februaryTaxAmount: 300, ruleVersion: 'MH-2023' };
  const activeExemption = {
    exempt: true, status: 'APPROVED', category: 'RETIRED_GOVERNMENT_OFFICER',
    validFrom: '2026-01-01', validUntil: '2026-12-31', provision: 'Schedule I entry',
  };
  test('approved, in-window exemption => PT 0 but the saved amount is reported', () => {
    const r = computePT({ slabs: [slab], salary: 50000, category: 'MALE', stateCode: 'MH', exemption: activeExemption });
    expect(r.finalPT).toBe(0);
    expect(r.isExempt).toBe(true);
    expect(r.exemptionAmount).toBe(200); // what WOULD have applied
  });
  test('pending exemption has no effect — full PT is charged', () => {
    const r = computePT({ slabs: [slab], salary: 50000, category: 'MALE', stateCode: 'MH', exemption: { ...activeExemption, status: 'PENDING' } });
    expect(r.finalPT).toBe(200);
    expect(r.isExempt).toBe(false);
  });
  test('rejected exemption has no effect', () => {
    const r = computePT({ slabs: [slab], salary: 50000, category: 'MALE', stateCode: 'MH', exemption: { ...activeExemption, status: 'REJECTED' } });
    expect(r.finalPT).toBe(200);
  });
  test('expired exemption window => charged again', () => {
    expect(exemptionActive({ ptExempt: true, ptExemptionStatus: 'APPROVED', ptExemptionValidUntil: '2025-01-01' }, '2026-06-01')).toBe(false);
    expect(exemptionActive({ ptExempt: true, ptExemptionStatus: 'APPROVED', ptExemptionValidUntil: '2025-01-01' }, '2024-06-01')).toBe(true);
  });
  test('age/disability are NOT auto-exemption triggers: no exemption flag => charged', () => {
    const r = computePT({ slabs: [slab], salary: 50000, category: 'MALE', stateCode: 'MH', exemption: { exempt: false } });
    expect(r.finalPT).toBe(200);
  });
});

describe('Professional Tax — category resolution (explicitly maintained)', () => {
  test('explicit ptCategory wins over gender', () => {
    expect(resolveCategory({ ptCategory: 'FEMALE', gender: 'MALE' })).toBe('FEMALE');
  });
  test('falls back to gender only when no explicit category', () => {
    expect(resolveCategory({ ptCategory: null, gender: 'MALE' })).toBe('MALE');
  });
  test('neither => null (never inferred from name/age)', () => {
    expect(resolveCategory({ ptCategory: null, gender: null, name: 'Rao' })).toBe(null);
  });
});

describe('Professional Tax — statutory engine integration (applyStatutoryComponents)', () => {
  const slabRows = [
    { id: 41, statutoryType: 'PT', stateCode: 'MH', employeeRate: 0, employerRate: 0, wageBasis: 'GROSS', wageCeiling: null,
      employeeCategory: 'MALE', minimumSalary: 0, maximumSalary: 7500, normalTaxAmount: 0, februaryTaxAmount: 0,
      legalReference: 'MH PT Act 1975 Sch I', ruleVersion: 'MH-2023', effectiveFrom: new Date('2023-04-01'), effectiveTo: null, isActive: true },
    { id: 42, statutoryType: 'PT', stateCode: 'MH', employeeRate: 0, employerRate: 0, wageBasis: 'GROSS', wageCeiling: null,
      employeeCategory: 'MALE', minimumSalary: 7501, maximumSalary: 10000, normalTaxAmount: 175, februaryTaxAmount: 175,
      ruleVersion: 'MH-2023', effectiveFrom: new Date('2023-04-01'), effectiveTo: null, isActive: true },
    { id: 43, statutoryType: 'PT', stateCode: 'MH', employeeRate: 0, employerRate: 0, wageBasis: 'GROSS', wageCeiling: null,
      employeeCategory: 'MALE', minimumSalary: 10001, maximumSalary: null, normalTaxAmount: 200, februaryTaxAmount: 300,
      ruleVersion: 'MH-2023', effectiveFrom: new Date('2023-04-01'), effectiveTo: null, isActive: true },
  ];
  const baseSlab = (over = {}) => ({ id: 43, minimumSalary: 10001, maximumSalary: null, normalTaxAmount: 200, februaryTaxAmount: 300, ruleVersion: 'MH-2023', ...over });

  const fakePrisma = (slabs, flatPT = null) => ({
    payrollStatutorySetting: {
      findMany: jest.fn().mockResolvedValue([]), // no stateless rules: PF/ESI off
      findFirst: jest.fn().mockResolvedValue(null),
    },
    payrollPTTransaction: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 1 }) },
    payrollPTFiling: { upsert: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    payrollAuditLog: { create: jest.fn().mockResolvedValue({}) },
    employeePayrollProfile: { findUnique: jest.fn(), upsert: jest.fn() },
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ c: 1 }]),
    __slabs: slabs,
    __flat: flatPT,
  });

  test('state+category set => slab PT (200 normal / 300 Feb), PF/ESI untouched', async () => {
    const prisma = fakePrisma();
    // The engine reads slabs through the professional-tax service; simulate its load by
    // preloading into the prisma the service receives. ProfessionalTaxService.loadSlabs
    // hits prisma.payrollStatutorySetting.findMany — return our slab rows for the PT query.
    prisma.payrollStatutorySetting.findMany.mockImplementation(async (arg) => {
      if (arg?.where?.statutoryType === 'PT' && arg?.where?.employeeCategory) return slabRows;
      return [];
    });
    prisma.payrollStatutorySetting.findFirst.mockImplementation(async (arg) => (arg?.where?.statutoryType === 'PT' && arg?.where?.stateCode === null ? null : arg));

    const profile = { stateCode: 'MH', ptCategory: 'MALE', pfApplicable: false, esiApplicable: false, gender: 'MALE' };
    const jan = await PayrollService.applyStatutoryComponents(prisma, profile, [{ name: 'Basic Salary', type: 'EARNING', amount: 50000, sortOrder: 1 }], 1, 2026);
    const feb = await PayrollService.applyStatutoryComponents(prisma, profile, [{ name: 'Basic Salary', type: 'EARNING', amount: 50000, sortOrder: 1 }], 2, 2026);
    const ptRow = (r) => r.components.find((c) => c.name === 'Professional Tax');
    expect(ptRow(jan).amount).toBe(200);
    expect(ptRow(feb).amount).toBe(300);
    // Exactly one PT deduction line (no duplicate on recompute).
    expect(jan.components.filter((c) => c.name === 'Professional Tax')).toHaveLength(1);
    // PF/ESI not present (not applicable) — proves other logic is intact.
    expect(jan.components.find((c) => /Provident Fund|ESI/.test(c.name))).toBeUndefined();
  });

  test('state set but no category => PT 0 + NO_CATEGORY skip flag (never guessed)', async () => {
    const prisma = fakePrisma();
    prisma.payrollStatutorySetting.findMany.mockResolvedValue([]);
    const profile = { stateCode: 'MH', ptCategory: null, gender: null };
    const r = await PayrollService.applyStatutoryComponents(prisma, profile, [{ name: 'Basic Salary', type: 'EARNING', amount: 50000, sortOrder: 1 }], 3, 2026);
    const pt = r.appliedSettings.find((s) => s.type === 'PT');
    expect(r.components.find((c) => c.name === 'Professional Tax').amount).toBe(0);
    expect(pt.pt.skipReason).toBe('NO_CATEGORY');
  });

  test('approved in-window exemption => 0 with the saved amount reported', async () => {
    const prisma = fakePrisma();
    prisma.payrollStatutorySetting.findMany.mockImplementation(async (arg) => {
      if (arg?.where?.statutoryType === 'PT' && arg?.where?.employeeCategory) return slabRows;
      return [];
    });
    const profile = {
      stateCode: 'MH', ptCategory: 'MALE',
      ptExempt: true, ptExemptionStatus: 'APPROVED',
      ptExemptionValidFrom: '2026-01-01', ptExemptionValidUntil: '2026-12-31',
    };
    const r = await PayrollService.applyStatutoryComponents(prisma, profile, [{ name: 'Basic Salary', type: 'EARNING', amount: 50000, sortOrder: 1 }], 3, 2026);
    const pt = r.appliedSettings.find((s) => s.type === 'PT');
    expect(r.components.find((c) => c.name === 'Professional Tax').amount).toBe(0);
    expect(pt.pt.isExempt).toBe(true);
    expect(pt.pt.exemptionAmount).toBe(200);
  });

  test('legacy stateless fallback: no stateCode, a flat PT rule exists => legacy amount kept', async () => {
    const flatPT = { id: 7, statutoryType: 'PT', stateCode: null, employeeRate: 200, wageCeiling: 10000, isActive: true };
    const prisma = fakePrisma([], flatPT);
    prisma.payrollStatutorySetting.findMany.mockResolvedValue([flatPT]);
    const profile = { stateCode: null, pfApplicable: false };
    const r = await PayrollService.applyStatutoryComponents(prisma, profile, [{ name: 'Basic Salary', type: 'EARNING', amount: 50000, sortOrder: 1 }], 3, 2026);
    expect(r.components.find((c) => c.name === 'Professional Tax').amount).toBe(200);
  });
});

describe('Professional Tax — duplicate prevention & historical integrity', () => {
  test('writeTransaction is idempotent per payroll record (recalculation is a no-op)', async () => {
    let created = 0;
    const prisma = {
      payrollPTTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async () => { created += 1; return { id: 1 }; }),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ c: 1 }]),
    };
    // First write creates.
    const first = await ProfessionalTaxService.writeTransaction(prisma, { id: 55, employeeId: 9, month: 3, year: 2026 }, { finalPT: 200, stateCode: 'MH', category: 'MALE', taxableSalaryBasis: 50000, details: {} });
    expect(first.skipped).toBe(false);
    expect(created).toBe(1);
    // Recalculation finds the existing row and skips.
    prisma.payrollPTTransaction.findFirst.mockResolvedValue({ id: 1 });
    const second = await ProfessionalTaxService.writeTransaction(prisma, { id: 55, employeeId: 9, month: 3, year: 2026 }, { finalPT: 200, details: {} });
    expect(second.skipped).toBe(true);
    expect(created).toBe(1); // no second insert
  });

  test('a rule version change must not rewrite a frozen past record', async () => {
    // Simulate: a record computed under MH-2023 (PT 200). A later version
    // (MH-2027, PF 15% analog: PT 250) exists but the record keeps its
    // snapshot. The PT transaction references the rule version it was run under.
    const txn = { ruleVersion: 'MH-2023', finalPT: 200, normalPT: 200 };
    // Recomputing the SAME record must not create a second transaction row.
    let inserts = 0;
    const prisma = {
      payrollPTTransaction: {
        findFirst: jest.fn().mockResolvedValue({ id: 3, ...txn }),
        create: jest.fn().mockImplementation(async () => { inserts += 1; return { id: 99 }; }),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ c: 1 }]),
    };
    await ProfessionalTaxService.writeTransaction(prisma, { id: 3, employeeId: 1, month: 4, year: 2026 }, { finalPT: 250, ruleVersion: 'MH-2027', details: {} });
    expect(inserts).toBe(0); // historical record untouched
  });
});

describe('Employer filing frequency (Maharashtra Rule 11 + amendments)', () => {
  test('prev-year liability below 1,00,000 => ANNUAL filing', () => {
    expect(ProfessionalTaxService.determineFilingFrequency(99999).filingFrequency).toBe('ANNUAL');
  });
  test('prev-year liability at/above 1,00,000 => MONTHLY filing', () => {
    expect(ProfessionalTaxService.determineFilingFrequency(100000).filingFrequency).toBe('MONTHLY');
    expect(ProfessionalTaxService.determineFilingFrequency(500000).filingFrequency).toBe('MONTHLY');
  });
  test('threshold boundary uses the 100000 mark', () => {
    expect(ProfessionalTaxService.determineFilingFrequency(100000).threshold).toBe(100000);
  });
});

describe('matchSlab banding', () => {
  test('exact band membership picks the right slab', () => {
    expect(matchSlab(MH_MALE, 8000).id).toBe(2);
    expect(matchSlab(MH_MALE, 10000).id).toBe(2); // inclusive upper
    expect(matchSlab(MH_MALE, 50000).id).toBe(3);
    expect(matchSlab(MH_FEMALE, 25000).id).toBe(4);
    expect(matchSlab(MH_FEMALE, 25001).id).toBe(5);
  });
  test('below the lowest floor => first (zero) slab', () => {
    expect(matchSlab(MH_MALE, 100).id).toBe(1);
  });
});
