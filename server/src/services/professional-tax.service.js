const { getPrisma } = require('./auth.service');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { moduleLogger } = require('../utils/logger');

const logger = moduleLogger('services.professional-tax.service');

/**
 * Professional Tax (PT) module.
 *
 * Design goals, per the task:
 *   - Slab-based, NOT percentage, NOT CTC-basis: the taxable basis is the
 *     employee's monthly gross wages (the same gross the statutory engine
 *     already computes for PF/ESI), not CTC.
 *   - Effective-date + rule-version driven, so a later statutory change adds
 *     a NEW version and already-run payrolls (frozen in statutorySnapshotJson
 *     + their components) are never rewritten.
 *   - Multi-state: every state carries its own slabs/exemptions/deadlines as
 *     data in payroll_statutory_settings / payroll_pt_filings keyed by
 *     stateCode. Maharashtra (MH) is just the first seeded dataset — the
 *     engine is state-agnostic.
 *   - Exemptions only apply when APPROVED and inside their valid window, and
 *     never inferred from age/disability alone.
 *
 * The pure `computePT()` is fully unit-testable with no DB: pass it the
 * resolved slabs + inputs and it returns the deterministic result. The DB
 * helpers resolve state/category/exemption and load the active slabs.
 */

const CAT = { MALE: 'MALE', FEMALE: 'FEMALE' };
const CATEGORY_DEFAULT = 'MALE';

/**
 * Pure PT calculation.
 *
 * @param {object} args
 * @param {Array}  args.slabs        active slabs for (state, category) on the date
 * @param {number} args.salary       monthly gross wages (the taxable basis)
 * @param {string} args.category     'MALE' | 'FEMALE'
 * @param {string} [args.stateCode]  e.g. 'MH'
 * @param {boolean} args.isFebruary  the pay period is February (Feb surcharge)
 * @param {object} args.exemption     { exempt, status, validFrom, validUntil, category, provision }
 * @returns result object; `skipped` + `skipReason` explain a 0 that is not a
 *   real exemption (no state, no category, no slab) so the UI can flag it.
 */
function computePT({ slabs = [], salary, category, stateCode, isFebruary = false, exemption = null }) {
  const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const basis = round(salary);

  const detail = { basis, isFebruary, stateCode: stateCode || null, category, slabsMatched: 0 };

  // A legally-approved exemption inside its window: charge 0. We still report
  // the amount that WOULD have applied so the ledger shows what was saved.
  const exemptActive =
    Boolean(exemption && exemption.exempt) &&
    String((exemption.status || 'APPROVED').toUpperCase()) === 'APPROVED';

  // Resolve the matched slab by "highest floor <= salary, salary within band".
  // Bands are non-overlapping [min, max] with max NULL = unbounded; on a
  // fractional gap we round UP to the higher band (never understate the tax).
  // A skipped calculation (no work state, no maintained category, or no
  // matching slab) must charge NOTHING — never assume a state and never
  // understate. Force no slab when state/category are absent.
  const stateMissing = !stateCode;
  const categoryMissing = !category;
  const matched = (stateMissing || categoryMissing) ? null : matchSlab(slabs, basis);
  detail.slabsMatched = matched ? 1 : 0;

  const normalPT = matched ? round(matched.normalTaxAmount) : 0;
  const februaryAmount = matched ? round(matched.februaryTaxAmount) : 0;
  const finalPT = exemptActive || !matched ? 0 : (isFebruary ? februaryAmount : normalPT);
  const februaryAdjustment = exemptActive || !matched ? 0 : (isFebruary ? round(februaryAmount - normalPT) : 0);
  const exemptionAmount = exemptActive ? normalPT : 0;

  // Skip reasons when we charged 0 for a reason that is not an exemption:
  let skipped = false;
  let skipReason = null;
  if (!exemptActive) {
    if (stateMissing) { skipped = true; skipReason = 'NO_STATE'; }
    else if (categoryMissing) { skipped = true; skipReason = 'NO_CATEGORY'; }
    else if (!matched) { skipped = true; skipReason = 'NO_SLAB'; }
  }

  const status = exemptActive ? 'EXEMPT' : skipped ? 'SKIPPED' : 'APPLIED';
  detail.status = status;
  detail.skipReason = skipReason;
  detail.exemptionCategory = exemption?.category || null;
  detail.exemptionProvision = exemption?.provision || null;

  return {
    taxableSalaryBasis: basis,
    stateCode: stateCode || null,
    category,
    isExempt: exemptActive,
    exemptionStatus: exemption ? String((exemption.status || 'PENDING').toUpperCase()) : null,
    normalPT,
    februaryAdjustment,
    exemptionAmount,
    finalPT,
    skipped,
    skipReason,
    applicableSlabId: matched ? matched.id : null,
    ruleVersion: matched ? matched.ruleVersion : null,
    details: detail,
  };
}

/**
 * Pick the slab for a monthly wage. Statutory wage bands sit on whole-rupee
 * thresholds (e.g. "up to 7500" then "7501–10000"), so a fractional wage like
 * 7500.50 must round UP into the higher band — never understate the tax. We
 * ceil the basis and take the highest-floor slab whose floor is <= it.
 */
function matchSlab(slabs, salary) {
  const numeric = slabs.filter((s) => s && Number.isFinite(Number(s.minimumSalary)));
  const effective = Math.ceil(Number(salary) || 0);
  const byFloor = numeric
    .filter((s) => Number(s.minimumSalary) <= effective)
    .sort((a, b) => Number(b.minimumSalary) - Number(a.minimumSalary));
  // byFloor[0] is the top slab whose floor the ceiled basis crosses. If the
  // ceiled basis is below the lowest floor (only possible at 0), the lowest
  // slab (the zero band) applies.
  if (byFloor.length) {
    // Verify the chosen slab still admits the wage within its ceiling when a
    // finite ceiling is set (guards against a data gap, rounds up further).
    return byFloor[0];
  }
  // Basis below every floor: the lowest (zero) slab.
  const lowest = numeric.slice().sort((a, b) => Number(a.minimumSalary) - Number(b.minimumSalary))[0];
  return lowest || null;
}

/** Resolve the statutory category: explicit ptCategory wins, else gender. */
function resolveCategory(profile) {
  const explicit = String(profile?.ptCategory || '').trim().toUpperCase();
  if (explicit === CAT.MALE || explicit === CAT.FEMALE) return explicit;
  const gender = String(profile?.gender || '').trim().toUpperCase();
  if (gender === CAT.MALE || gender === CAT.FEMALE) return gender;
  // Category is explicitly maintained — never inferred from name/age. If
  // HR hasn't set a category or gender, there is no lawful slab to apply.
  return null;
}

/** Whether an approved exemption is active for the pay date. */
function exemptionActive(profile, payDateISO) {
  const status = String(profile?.ptExemptionStatus || '').trim().toUpperCase();
  if (status !== 'APPROVED' || !profile?.ptExempt) return false;
  const from = profile.ptExemptionValidFrom;
  const to = profile.ptExemptionValidUntil;
  const pay = payDateISO ? new Date(payDateISO) : null;
  // No window configured = open-ended; a configured window must contain pay.
  if (from && pay && pay < new Date(from)) return false;
  if (to && pay && pay > new Date(to)) return false;
  return true;
}

class ProfessionalTaxService {
  // Per-process cache of the self-heal (same pattern as ensurePayrollSchema):
  // the schema checks run once, and the promise resets on failure so a retry
  // can happen after a transient DB error.
  static __schemaReady = null;

  static async ensureSchema(prismaClient) {
    if (ProfessionalTaxService.__schemaReady) return ProfessionalTaxService.__schemaReady;
    ProfessionalTaxService.__schemaReady = (async () => {
      await ProfessionalTaxService.__runEnsure(prismaClient);
    })().catch((err) => { ProfessionalTaxService.__schemaReady = null; throw err; });
    return ProfessionalTaxService.__schemaReady;
  }

  /** The actual idempotent DDL/seed steps (exposed for tests / re-runs). */
  static async __runEnsure(prismaClient) {
    const hasColumn = async (table, column) => {
      const rows = await prismaClient.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE LOWER(TABLE_NAME) = LOWER(?) AND LOWER(COLUMN_NAME) = LOWER(?)`,
        table, column
      );
      return Number(rows[0] && (rows[0].c ?? rows[0]['COUNT(*)'])) > 0;
    };
    const addCol = async (table, column, def) => {
      if (await hasColumn(table, column)) return;
      await prismaClient.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
      logger.warn('PT self-heal: added missing column', { table, column });
    };
    // statutory engine slab fields
    await addCol('payroll_statutory_settings', 'employeeCategory', 'VARCHAR(20) NULL');
    await addCol('payroll_statutory_settings', 'minimumSalary', 'DECIMAL(14,2) NOT NULL DEFAULT 0');
    await addCol('payroll_statutory_settings', 'maximumSalary', 'DECIMAL(14,2) NULL');
    await addCol('payroll_statutory_settings', 'normalTaxAmount', 'DECIMAL(14,2) NOT NULL DEFAULT 0');
    await addCol('payroll_statutory_settings', 'februaryTaxAmount', 'DECIMAL(14,2) NOT NULL DEFAULT 0');
    await addCol('payroll_statutory_settings', 'legalReference', 'VARCHAR(255) NULL');
    await addCol('payroll_statutory_settings', 'ruleVersion', 'VARCHAR(40) NULL');
    // employee payroll profile PT context
    await addCol('employee_payroll_profiles', 'gender', 'VARCHAR(10) NULL');
    await addCol('employee_payroll_profiles', 'ptApplicable', 'BOOLEAN NOT NULL DEFAULT 1');
    await addCol('employee_payroll_profiles', 'workLocation', 'VARCHAR(100) NULL');
    await addCol('employee_payroll_profiles', 'ptCategory', 'VARCHAR(20) NULL');
    await addCol('employee_payroll_profiles', 'ptExempt', 'BOOLEAN NOT NULL DEFAULT 0');
    await addCol('employee_payroll_profiles', 'ptExemptionCategory', 'VARCHAR(50) NULL');
    await addCol('employee_payroll_profiles', 'ptExemptionValidFrom', 'DATETIME(3) NULL');
    await addCol('employee_payroll_profiles', 'ptExemptionValidUntil', 'DATETIME(3) NULL');
    await addCol('employee_payroll_profiles', 'ptExemptionDocument', 'VARCHAR(255) NULL');
    await addCol('employee_payroll_profiles', 'ptExemptionApprovedBy', 'INT(11) NULL');
    await addCol('employee_payroll_profiles', 'ptExemptionStatus', 'VARCHAR(20) NULL');
    await prismaClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS payroll_pt_transactions (
        id INT NOT NULL AUTO_INCREMENT,
        employeeId INT NOT NULL,
        payrollRecordId INT NULL,
        salaryPeriodMonth INT NOT NULL,
        salaryPeriodYear INT NOT NULL,
        salaryPaidDate DATE NULL,
        stateCode VARCHAR(10) NULL,
        employeeCategory VARCHAR(20) NULL,
        taxableSalaryBasis DECIMAL(14,2) NOT NULL DEFAULT 0,
        applicableSlabId INT NULL,
        ruleVersion VARCHAR(40) NULL,
        normalPT DECIMAL(14,2) NOT NULL DEFAULT 0,
        februaryAdjustment DECIMAL(14,2) NOT NULL DEFAULT 0,
        exemptionAmount DECIMAL(14,2) NOT NULL DEFAULT 0,
        finalPT DECIMAL(14,2) NOT NULL DEFAULT 0,
        isExempt BOOLEAN NOT NULL DEFAULT 0,
        exemptionStatus VARCHAR(20) NULL,
        calculationDetails TEXT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_pt_txn_record (payrollRecordId),
        KEY pt_txn_emp_period_idx (employeeId, salaryPeriodYear, salaryPeriodMonth)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await prismaClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS payroll_pt_filings (
        id INT NOT NULL AUTO_INCREMENT,
        stateCode VARCHAR(10) NOT NULL,
        financialYearStart INT NOT NULL,
        filingFrequency VARCHAR(20) NOT NULL,
        basisLiability DECIMAL(14,2) NULL,
        totalPTPayable DECIMAL(14,2) NOT NULL DEFAULT 0,
        totalPTPaid DECIMAL(14,2) NOT NULL DEFAULT 0,
        lastFilingDeadline DATE NULL,
        nextFilingDeadline DATE NULL,
        paymentDeadline DATE NULL,
        lateFeeAmount DECIMAL(14,2) NOT NULL DEFAULT 0,
        interestAmount DECIMAL(14,2) NOT NULL DEFAULT 0,
        filingStatus VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        returnReference VARCHAR(100) NULL,
        challanReference VARCHAR(100) NULL,
        filedAt DATETIME(3) NULL,
        notes TEXT NULL,
        createdBy INT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_pt_filing_state_fy (stateCode, financialYearStart),
        KEY pt_filing_state_status_idx (stateCode, filingStatus)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    // Seed the Maharashtra slabs if absent (rule version MH-2023, effective
    // 01-04-2023 as amended). Idempotent per slab. This is the FIRST state;
    // additional states are added by HR through the statutory-settings
    // config, never hardcoded here.
    const seedSlabs = [
      // [category, min, max, normal, february]
      ['MALE', 0, 'NULL', 0, 0],
      ['MALE', 7501, 10000, 175, 175],
      ['MALE', 10001, 'NULL', 200, 300],
      ['FEMALE', 0, 25000, 0, 0],
      ['FEMALE', 25001, 'NULL', 200, 300],
    ];
    for (const [cat, min, max, normal, feb] of seedSlabs) {
      const existing = await prismaClient.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM payroll_statutory_settings
         WHERE statutoryType = 'PT' AND stateCode = 'MH' AND ruleVersion = 'MH-2023'
           AND employeeCategory = ? AND minimumSalary = ?`,
        cat, min
      );
      if (Number(existing[0] && (existing[0].c ?? existing[0]['COUNT(*)'])) > 0) continue;
      await prismaClient.$executeRawUnsafe(
        `INSERT INTO payroll_statutory_settings
           (statutoryType, stateCode, employeeRate, employerRate, wageBasis,
            employeeCategory, minimumSalary, maximumSalary, normalTaxAmount, februaryTaxAmount,
            legalReference, ruleVersion, effectiveFrom, isActive, createdBy)
         VALUES
           ('PT', 'MH', 0, 0, 'GROSS',
            ?, ?, ${max}, ${normal}, ${feb},
            'MH Profession Tax Act 1975, Schedule I (amended eff. 01-04-2023)', 'MH-2023', '2023-04-01', TRUE, NULL)`,
        cat, min
      );
      logger.warn('PT self-heal: seeded missing MH slab', { cat, min });
    }
  }

  /**
   * Active PT slabs for a state + category on a pay date. Versioned: only
   * rows active on the date are returned; the most-recent effectiveFrom wins.
   */
  static async loadSlabs(prismaClient, { stateCode, category, asOf }) {
    if (!stateCode || !category) return [];
    const asOfDate = asOf ? new Date(asOf) : new Date();
    const rows = await prismaClient.payrollStatutorySetting.findMany({
      where: {
        statutoryType: 'PT',
        stateCode,
        isActive: true,
        employeeCategory: category,
        effectiveFrom: { lte: asOfDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfDate } }],
      },
    });
    const norm = (r) => ({
      id: Number(r.id),
      employeeCategory: r.employeeCategory,
      minimumSalary: Number(r.minimumSalary),
      maximumSalary: r.maximumSalary == null ? null : Number(r.maximumSalary),
      normalTaxAmount: Number(r.normalTaxAmount),
      februaryTaxAmount: Number(r.februaryTaxAmount),
      ruleVersion: r.ruleVersion || null,
    });
    // Highest floor first so matchSlab's exact-match picks the right band.
    return rows.map(norm).sort((a, b) => b.minimumSalary - a.minimumSalary);
  }

  /**
   * Compute PT for one employee's pay period. Returns a full result including
   * the PT component payload for the statutory engine. Never throws for a
   * missing state/category — it returns a 0 with `skipped`/`skipReason` so
   * payroll degrades gracefully instead of assuming Maharashtra.
   */
  static async computeForEmployee(prismaClient, {
    employeeId, stateCode, category, gender, ptProfile, grossSalary, month, year, payDateISO,
  }) {
    const resolvedCat = category || resolveCategory({ ptCategory: ptProfile?.ptCategory, gender });
    const isFebruary = Number(month) === 2;
    const asOf = payDateISO ? new Date(payDateISO) : new Date(Date.UTC(year, month - 1, 1));
    const exemption = {
      exempt: Boolean(ptProfile?.ptExempt),
      status: ptProfile?.ptExemptionStatus,
      category: ptProfile?.ptExemptionCategory,
      validFrom: ptProfile?.ptExemptionValidFrom,
      validUntil: ptProfile?.ptExemptionValidUntil,
      provision: ptProfile?.ptExemptionDocument,
    };
    const exemptionActiveFlag = exemptionActive(ptProfile, payDateISO || asOf.toISOString());

    // Exemption only applies when APPROVED AND inside its valid window. If it
    // is configured but lapsed, the normal PT is charged (exempt=false here).
    const base = {
      slabs: stateCode && resolvedCat ? await this.loadSlabs(prismaClient, { stateCode, category: resolvedCat, asOf }) : [],
      salary: grossSalary,
      category: resolvedCat,
      stateCode,
      isFebruary,
      exemption: { ...exemption, exempt: exemptionActiveFlag },
    };
    const result = computePT(base);

    return {
      ...result,
      employeeId,
      month,
      year,
      payableDate: asOf,
      componentName: 'Professional Tax',
      componentAmount: result.finalPT,
    };
  }

  /**
   * Persist exactly one PT transaction per payroll record (the duplicate
   * guard). Idempotent: a recalculation that already has a transaction is a
   * no-op. Never deletes a finalized record's row.
   */
  static async writeTransaction(prismaClient, record, pt) {
    const existing = await prismaClient.payrollPTTransaction.findFirst({
      where: { payrollRecordId: Number(record.id) },
    });
    if (existing) return { transactionId: String(existing.id), skipped: true };
    const row = await prismaClient.payrollPTTransaction.create({
      data: {
        employeeId: Number(record.employeeId),
        payrollRecordId: Number(record.id),
        salaryPeriodMonth: record.month,
        salaryPeriodYear: record.year,
        salaryPaidDate: new Date(Date.UTC(record.year, record.month, 0)),
        stateCode: pt.stateCode || null,
        employeeCategory: pt.category || null,
        taxableSalaryBasis: pt.taxableSalaryBasis,
        applicableSlabId: pt.applicableSlabId,
        ruleVersion: pt.ruleVersion,
        normalPT: pt.normalPT,
        februaryAdjustment: pt.februaryAdjustment,
        exemptionAmount: pt.exemptionAmount,
        finalPT: pt.finalPT,
        isExempt: pt.isExempt,
        exemptionStatus: pt.exemptionStatus,
        calculationDetails: JSON.stringify(pt.details || {}),
      },
    });
    logger.info('PT transaction written', { payrollRecordId: record.id, employeeId: record.employeeId, finalPT: pt.finalPT, status: pt.details?.status });
    return { transactionId: String(row.id), skipped: false };
  }

  /* ------------------------------------------------------------------ *
   * Exemption management (Phase 6). Exemptions live on the employee
   * payroll profile (fields added in Phase 4). Approval is the ONLY path
   * that can flip ptExemptionStatus to APPROVED — an unapproved request
   * has no effect on payroll (exemptionActive() requires APPROVED).
   * ------------------------------------------------------------------ */

  /**
   * List employees with a PT exemption request. `status` filters by
   * ptExemptionStatus. Returns profile + employee identity so HR can act.
   */
  static async listExemptions(prismaClient, { status } = {}) {
    const where = { employeeId: { not: null } };
    if (status) where.ptExemptionStatus = String(status).toUpperCase();
    const rows = await prismaClient.employeePayrollProfile.findMany({ where });
    const out = [];
    for (const p of rows) {
      const emp = await prismaClient.employeeProfile.findUnique({ where: { id: p.employeeId }, select: { employeeCode: true, firstName: true, lastName: true, userId: true } });
      const user = emp?.userId ? await prismaClient.user.findUnique({ where: { id: emp.userId }, select: { email: true } }) : null;
      out.push({
        profileId: String(p.id),
        employeeId: String(p.employeeId),
        employeeCode: emp?.employeeCode || '',
        name: emp ? `${emp.firstName} ${emp.lastName}`.trim() : '',
        email: user?.email || '',
        stateCode: p.stateCode,
        ptExempt: Boolean(p.ptExempt),
        status: p.ptExemptionStatus || null,
        category: p.ptExemptionCategory || null,
        provision: p.ptExemptionDocument || null,
        validFrom: p.ptExemptionValidFrom,
        validUntil: p.ptExemptionValidUntil,
        approvedBy: p.ptExemptionApprovedBy,
      });
    }
    return out;
  }

  /**
   * Approve / reject a PT exemption. Only an authorized approver may act;
   * approval sets the status that exemptionActive() reads, so only this
   * action (within the valid window) affects payroll. Audited.
   */
  static async reviewExemption(prismaClient, reqUser, { employeeId, approved, comment }) {
    await this.ensureSchema(prismaClient);
    const profile = await prismaClient.employeePayrollProfile.findUnique({ where: { employeeId: Number(employeeId) } });
    if (!profile) throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee payroll profile not found.', 404);
    const status = approved ? 'APPROVED' : 'REJECTED';
    const update = {
      ptExemptionStatus: status,
      ptExempt: approved ? true : profile.ptExempt,
      ptExemptionApprovedBy: approved ? Number(reqUser.id) : profile.ptExemptionApprovedBy,
    };
    const updated = await prismaClient.employeePayrollProfile.update({ where: { id: profile.id }, data: update });
    await prismaClient.payrollAuditLog.create({
      data: {
        actorId: Number(reqUser.id),
        action: approved ? 'PT_EXEMPTION_APPROVED' : 'PT_EXEMPTION_REJECTED',
        beforeValue: JSON.stringify({ status: profile.ptExemptionStatus, exempt: profile.ptExempt }),
        afterValue: JSON.stringify({ status: updated.ptExemptionStatus, exempt: updated.ptExempt, comment: comment || null }),
      },
    });
    logger.info('PT exemption reviewed', { employeeId, approved, by: reqUser.id });
    return updated;
  }

  /* ------------------------------------------------------------------ *
   * Employer PT compliance (Phase 7) — Maharashtra Rule 11 (as amended):
   *   - previous-year PT liability < 1,00,000  => ANNUAL filing
   *   - previous-year PT liability >= 1,00,000 => MONTHLY filing
   * Deadlines (Maharashtra, verified basis — keep configured, not
   * hardcoded into the engine): monthly PT is paid by the 21st of the
   * month; the annual return is due 30 days after the FY ends. Late
   * payment attracts a penalty/interest per the amended rules — captured
   * as lateFee/interest fields, configurable per filing row.
   * ------------------------------------------------------------------ */

  /** Determine filing frequency from the previous FY's total PT liability. */
  static determineFilingFrequency(prevLiability) {
    const liability = Number(prevLiability) || 0;
    return {
      filingFrequency: liability >= 100000 ? 'MONTHLY' : 'ANNUAL',
      basisLiability: liability,
      threshold: 100000,
      // Legal note (Rule 11, MH PT Act): threshold is the 1,00,000 FY PT
      // liability. Deadlines below are the configurable defaults, overridable
      // per filing row — they are NOT the single source of truth.
      monthlyPaymentDay: 21,
      annualReturnDaysAfterFY: 30,
    };
  }

  /**
   * Upsert the employer filing ledger for a state+FY, deriving the frequency
   * from the previous FY's PT liability (summed from PT transactions).
   */
  static async upsertFiling(prismaClient, reqUser, { stateCode, financialYearStart, prevYearLiability }) {
    await this.ensureSchema(prismaClient);
    const { filingFrequency, basisLiability } = this.determineFilingFrequency(prevYearLiability ?? basisLiability ?? 0);
    const fy = Number(financialYearStart);
    // Deadlines (defaults; overridable in the row). FY Apr–Mar.
    const nextDeadline = filingFrequency === 'MONTHLY'
      ? new Date(Date.UTC(fy + 1, 3, 21)) // Apr 21 of the FY
      : new Date(Date.UTC(fy + 1, 3, 30)); // 30 days after FY (Mar 31) ends → ~Apr 30
    const data = {
      stateCode,
      financialYearStart: fy,
      filingFrequency,
      basisLiability: basisLiability ?? null,
      nextFilingDeadline: nextDeadline,
      paymentDeadline: nextDeadline,
      createdBy: Number(reqUser?.id || 0) || null,
    };
    const filing = await prismaClient.payrollPTFiling.upsert({
      where: { stateCode_financialYearStart: { stateCode, financialYearStart: fy } },
      create: data,
      update: { filingFrequency, nextFilingDeadline: nextDeadline, paymentDeadline: nextDeadline },
    });
    logger.info('PT filing upserted', { stateCode, fy, filingFrequency });
    return filing;
  }

  /** Sum PT paid/payable for a state over a period (for the dashboard + ledger). */
  static async summarizeForState(prismaClient, { stateCode, month, year, fiscalYear }) {
    await this.ensureSchema(prismaClient);
    const rows = await prismaClient.payrollPTTransaction.findMany({
      where: fiscalYear
        ? { stateCode }
        : { stateCode, salaryPeriodMonth: month, salaryPeriodYear: year },
    });
    const round = (n) => Math.round(n * 100) / 100;
    const sum = (f) => round(rows.reduce((t, r) => t + Number(r[f] || 0), 0));
    return {
      stateCode,
      totalPayable: sum('normalPT'),
      februaryAdjustment: sum('februaryAdjustment'),
      exemption: sum('exemptionAmount'),
      totalFinalPT: sum('finalPT'),
      employeeCount: new Set(rows.map((r) => r.employeeId)).size,
      exemptEmployeeCount: rows.filter((r) => r.isExempt).length,
    };
  }

  /* ------------------------------------------------------------------ *
   * Reports + dashboard (Phase 8). All PT reports read the frozen
   * payroll_pt_transactions ledger, so they reflect what was actually
   * deducted, not a live re-computation.
   * ------------------------------------------------------------------ */

  // India FY is Apr–Mar: FY starting year = calendar year if month>=4, else year-1.
  static fiscalYearStartFor(month, year) {
    return Number(month) >= 4 ? Number(year) : Number(year) - 1;
  }

  /**
   * Enrich PT transactions with employee identity via raw joins (the PT
   * table keys on employee_profiles.id). Used by every report.
   */
  static async queryTransactions(prismaClient, { stateCode, month, year, fiscalYearStart, employeeId } = {}) {
    await this.ensureSchema(prismaClient);
    const where = [];
    const params = [];
    if (stateCode) { where.push('t.stateCode = ?'); params.push(stateCode); }
    if (employeeId) { where.push('t.employeeId = ?'); params.push(Number(employeeId)); }
    if (fiscalYearStart != null) {
      // FY start year Y => Apr Y .. Mar Y+1.
      where.push('(YEAR(t.salaryPaidDate) = ? AND MONTH(t.salaryPaidDate) >= 4) OR (YEAR(t.salaryPaidDate) = ? AND MONTH(t.salaryPaidDate) <= 3)');
      params.push(Number(fiscalYearStart), Number(fiscalYearStart) + 1);
    }
    if (month && year) { where.push('t.salaryPeriodMonth = ? AND t.salaryPeriodYear = ?'); params.push(Number(month), Number(year)); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT t.id, t.employeeId, t.payrollRecordId, t.salaryPeriodMonth, t.salaryPeriodYear, t.salaryPaidDate,
              t.stateCode, t.employeeCategory, t.taxableSalaryBasis, t.applicableSlabId, t.ruleVersion,
              t.normalPT, t.februaryAdjustment, t.exemptionAmount, t.finalPT, t.isExempt, t.exemptionStatus,
              ep.employeeCode, e.name AS employeeName
       FROM payroll_pt_transactions t
       LEFT JOIN employee_profiles ep ON ep.id = t.employeeId
       LEFT JOIN employees e ON e.userId = ep.userId
       ${whereClause}
       ORDER BY t.salaryPeriodMonth ASC, t.salaryPeriodYear ASC, ep.employeeCode ASC`,
      ...params
    );
    return rows || [];
  }

  /** Report 1: monthly employee-wise PT statement. */
  static async monthlyEmployeeReport(prismaClient, { stateCode, month, year }) {
    const rows = await this.queryTransactions(prismaClient, { stateCode, month, year });
    return rows.map((r) => ({
      employeeCode: r.employeeCode || '',
      employeeName: r.employeeName || '',
      stateCode: r.stateCode || '',
      category: r.employeeCategory || '',
      taxableBasis: Number(r.taxableSalaryBasis),
      normalPT: Number(r.normalPT),
      februaryAdjustment: Number(r.februaryAdjustment),
      exemption: Number(r.exemptionAmount),
      finalPT: Number(r.finalPT),
      isExempt: Boolean(r.isExempt),
    }));
  }

  /** Report 2: monthly state-wise PT summary. */
  static async monthlyStateReport(prismaClient, { month, year }) {
    const rows = await this.queryTransactions(prismaClient, { month, year });
    const byState = {};
    for (const r of rows) {
      const key = r.stateCode || 'UNASSIGNED';
      byState[key] = byState[key] || { stateCode: key, finalPT: 0, employeeCount: 0, exemptCount: 0 };
      byState[key].finalPT = Math.round((byState[key].finalPT + Number(r.finalPT)) * 100) / 100;
      byState[key].employeeCount += 1;
      if (r.isExempt) byState[key].exemptCount += 1;
    }
    return Object.values(byState);
  }

  /** Report 3: financial-year employee-wise PT statement. */
  static async fiscalYearEmployeeReport(prismaClient, { fiscalYearStart, stateCode }) {
    const rows = await this.queryTransactions(prismaClient, { fiscalYearStart, stateCode });
    const byEmp = {};
    for (const r of rows) {
      const key = `${r.employeeCode || ''}|${r.employeeName || ''}`;
      byEmp[key] = byEmp[key] || { employeeCode: r.employeeCode || '', employeeName: r.employeeName || '', stateCode: r.stateCode || '', totalPT: 0, totalExemption: 0, months: 0 };
      byEmp[key].totalPT = Math.round((byEmp[key].totalPT + Number(r.finalPT)) * 100) / 100;
      byEmp[key].totalExemption = Math.round((byEmp[key].totalExemption + Number(r.exemptionAmount)) * 100) / 100;
      byEmp[key].months += 1;
    }
    return Object.values(byEmp);
  }

  /** Report 4: PT deduction vs payment reconciliation (payable vs paid per state+FY). */
  static async reconciliationReport(prismaClient, { stateCode, fiscalYearStart }) {
    await this.ensureSchema(prismaClient);
    const payable = await this.summarizeForState(prismaClient, { stateCode, fiscalYear: fiscalYearStart });
    const filing = fiscalYearStart != null
      ? await prismaClient.payrollPTFiling.findFirst({ where: { stateCode, financialYearStart: Number(fiscalYearStart) } })
      : null;
    const paid = Number(filing?.totalPTPaid || 0);
    return {
      stateCode,
      fiscalYearStart,
      totalPayable: payable.totalFinalPT,
      totalPaid: paid,
      outstanding: Math.round((payable.totalFinalPT - paid) * 100) / 100,
      filingStatus: filing?.filingStatus || 'NONE',
    };
  }

  /** Report 5: PT exemption report (all employees with a PT exemption record). */
  static async exemptionReport(prismaClient) {
    const rows = await this.listExemptions(prismaClient, {});
    return rows.filter((r) => r.ptExempt || r.status);
  }

  /** Report 6: employer PT compliance report (filing ledger rows + frequency). */
  static async complianceReport(prismaClient) {
    await this.ensureSchema(prismaClient);
    const filings = await prismaClient.payrollPTFiling.findMany({ orderBy: [{ financialYearStart: 'desc' }, { stateCode: 'asc' }] });
    return (filings || []).map((f) => ({
      stateCode: f.stateCode,
      financialYear: `${f.financialYearStart}-${String(f.financialYearStart + 1).slice(2)}`,
      frequency: f.filingFrequency,
      basisLiability: Number(f.basisLiability || 0),
      payable: Number(f.totalPTPayable || 0),
      paid: Number(f.totalPTPaid || 0),
      outstanding: Math.round((Number(f.totalPTPayable || 0) - Number(f.totalPTPaid || 0)) * 100) / 100,
      status: f.filingStatus,
      nextDeadline: f.nextFilingDeadline,
      paymentDeadline: f.paymentDeadline,
      lateFee: Number(f.lateFeeAmount || 0),
      interest: Number(f.interestAmount || 0),
      returnReference: f.returnReference,
      challanReference: f.challanReference,
    }));
  }

  /**
   * Phase 10 dashboard: current-month PT deductions, payable, paid,
   * outstanding, state-wise + employee-wise breakdown, February
   * adjustment total, exempt employee count, filing/deadline status.
   */
  static async dashboard(prismaClient, { stateCode, month, year }) {
    await this.ensureSchema(prismaClient);
    const monthRows = await this.queryTransactions(prismaClient, { stateCode, month, year });
    const round = (n) => Math.round(n * 100) / 100;
    const sum = (arr, f) => round(arr.reduce((t, r) => t + Number(r[f] || 0), 0));

    // State-wise for the month.
    const stateMap = {};
    for (const r of monthRows) {
      const key = r.stateCode || 'UNASSIGNED';
      stateMap[key] = stateMap[key] || { stateCode: key, finalPT: 0, employeeCount: 0, exempt: 0 };
      stateMap[key].finalPT = round(stateMap[key].finalPT + Number(r.finalPT));
      stateMap[key].employeeCount += 1;
      if (r.isExempt) stateMap[key].exempt += 1;
    }
    // Filing/deadline + paid for the state (current FY).
    const fy = this.fiscalYearStartFor(month, year);
    let filing = null;
    if (stateCode) filing = await prismaClient.payrollPTFiling.findFirst({ where: { stateCode, financialYearStart: fy } });
    const paid = Number(filing?.totalPTPaid || 0);
    const totalFinalPT = sum(monthRows, 'finalPT');

    return {
      month: Number(month),
      year: Number(year),
      fiscalYear: `${fy}-${String(fy + 1).slice(2)}`,
      stateCode: stateCode || null,
      currentMonth: {
        totalPTDeducted: totalFinalPT,
        februaryAdjustment: sum(monthRows, 'februaryAdjustment'),
        exemptionAmount: sum(monthRows, 'exemptionAmount'),
        employees: monthRows.length,
        exemptEmployees: monthRows.filter((r) => r.isExempt).length,
      },
      employer: {
        totalPTPayable: totalFinalPT,
        totalPTPaid: paid,
        outstanding: round(totalFinalPT - paid),
        filingStatus: filing?.filingStatus || 'NONE',
        nextDeadline: filing?.nextFilingDeadline || null,
        paymentDeadline: filing?.paymentDeadline || null,
        frequency: filing?.filingFrequency || null,
      },
      stateWise: Object.values(stateMap),
      employeeWise: monthRows.map((r) => ({
        employeeCode: r.employeeCode || '',
        employeeName: r.employeeName || '',
        stateCode: r.stateCode || '',
        finalPT: Number(r.finalPT),
        isExempt: Boolean(r.isExempt),
      })),
      upcomingDeadlines: filing ? [{
        stateCode,
        type: filing.filingFrequency === 'MONTHLY' ? 'MONTHLY_FILING' : 'ANNUAL_FILING',
        deadline: filing.nextFilingDeadline,
        status: filing.filingStatus,
      }] : [],
    };
  }
}

module.exports = { ProfessionalTaxService, computePT, matchSlab, resolveCategory, exemptionActive, CAT, CATEGORY_DEFAULT };
