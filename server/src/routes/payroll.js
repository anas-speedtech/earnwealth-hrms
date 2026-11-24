const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { PayrollService } = require('../services/payroll.service');
const { Role } = require('../types/index');
const { AppError, AppErrorCodes } = require('../errors/AppError');

const router = express.Router();

// ---- Schemas ----

// This deployment keys employees / departments / payroll rows by INT
// auto-increment ids (not uuids), so id-like fields coerce a numeric string
// to a positive int. A non-numeric value still fails (invalid type), which
// is what we want — just not a "not a UUID" failure.
const intId = z.coerce.number().int('Must be a valid numeric id').positive();

const salaryStructureSchema = z.object({
  employeeId: intId,
  monthlyCTC: z.number().positive('CTC must be greater than zero'),
  currency: z.string().length(3).default('INR'),
  isActive: z.boolean().optional().default(true),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional().nullable(),
  components: z.array(z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional().nullable(),
    type: z.enum(['EARNING', 'DEDUCTION']),
    calculationType: z.enum(['FIXED', 'PERCENTAGE_OF_CTC', 'PERCENTAGE_OF_BASIC', 'FORMULA', 'BALANCE']).default('FIXED'),
    amount: z.number().optional().nullable(),
    percentage: z.number().optional().nullable(),
    formula: z.string().optional().nullable(),
    sortOrder: z.number().int().optional().default(0),
    isActive: z.boolean().optional().default(true),
  })).optional().default([]),
});

const updateSalaryStructureSchema = z.object({
  monthlyCTC: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional().nullable(),
});

const createPayrollSchema = z.object({
  employeeId: intId,
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  applyAttendanceProration: z.boolean().optional().default(false),
});

const bulkPayrollSchema = z.object({
  departmentId: intId.optional(),
  employeeIds: z.array(intId).min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  applyAttendanceProration: z.boolean().optional().default(false),
});

const payrollFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  employeeId: intId.optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']).optional(),
  departmentId: intId.optional(),
  search: z.string().optional(),
});

const payrollActionSchema = z.object({
  comment: z.string().optional().default(''),
});

const componentOverrideSchema = z.object({
  id: intId,
  amount: z.number(),
});

const payheadSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(100),
  type: z.enum(['EARNING', 'DEDUCTION']),
  description: z.string().max(255).optional().nullable(),
  isFixedByDefault: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

const updatePayheadSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['EARNING', 'DEDUCTION']).optional(),
  description: z.string().max(255).optional().nullable(),
  isFixedByDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const salaryRulesSchema = z.object({
  basicPct: z.number().min(0).max(100).optional(),
  hraPctOfBasic: z.number().min(0).max(100).optional(),
  pfPct: z.number().min(0).max(100).optional(),
  pfCap: z.number().min(0).optional(),
  esicEmployerPct: z.number().min(0).max(100).optional(),
  esicEmployeePct: z.number().min(0).max(100).optional(),
  esicWageCeiling: z.number().min(0).optional(),
  professionTax: z.number().min(0).optional(),
  workingDaysMonth: z.number().int().min(0).max(31).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const salaryPreviewSchema = z.object({
  ctc: z.number().min(0),
});

const payrollPeriodSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  payrollGroup: z.string().max(100).optional().nullable(),
});

const payrollPeriodTransitionSchema = z.object({
  status: z.enum(['DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED', 'PAID']),
  reason: z.string().max(1000).optional().default(''),
});

const payrollPeriodReviewSchema = z.object({
  gate: z.enum(['HR_REVIEW', 'FINANCE_REVIEW']),
});

const oneTimeAdjustmentSchema = z.object({
  employeeId: z.number().int().positive(),
  type: z.enum(['ONE_TIME_EARNING', 'ONE_TIME_DEDUCTION', 'BONUS', 'INCENTIVE', 'ARREARS', 'SALARY_ADVANCE']),
  amount: z.number().positive(),
  reason: z.string().max(500).optional().nullable(),
});

const statutorySettingSchema = z.object({
  statutoryType: z.enum(['EPF', 'EPS', 'EDLI', 'PF_ADMIN', 'ESI', 'PT', 'LWF', 'TDS', 'GRATUITY', 'BONUS']),
  stateCode: z.string().max(10).optional().nullable(),
  employeeRate: z.number().min(0).max(100).optional().default(0),
  employerRate: z.number().min(0).max(100).optional().default(0),
  wageBasis: z.enum(['GROSS', 'BASIC', 'PF_WAGES', 'CTC']).optional().default('GROSS'),
  wageCeiling: z.number().min(0).optional().nullable(),
  eligibility: z.record(z.unknown()).optional().nullable(),
  configuration: z.record(z.unknown()).optional().nullable(),
  effectiveFrom: z.string().min(1), effectiveTo: z.string().optional().nullable(), isActive: z.boolean().optional().default(true),
});

const statutorySettingUpdateSchema = statutorySettingSchema.partial().omit({ statutoryType: true });

const employeePayrollProfileSchema = z.object({
  pan: z.string().max(20).optional().nullable(), uan: z.string().max(30).optional().nullable(),
  bankName: z.string().max(120).optional().nullable(), bankAccountMasked: z.string().max(40).optional().nullable(),
  bankIfsc: z.string().max(20).optional().nullable(), taxRegime: z.enum(['OLD', 'NEW']).optional(),
  pfApplicable: z.boolean().optional(), esiApplicable: z.boolean().optional(), voluntaryPfRate: z.number().min(0).max(100).optional().nullable(),
  salaryOnHold: z.boolean().optional(), holdReason: z.string().max(500).optional().nullable(),
  stateCode: z.string().max(10).optional().nullable(), exitDate: z.string().optional().nullable(), noticePeriodDays: z.number().int().min(0).max(365).optional(),
});
const loanSchema = z.object({ loanType: z.enum(['LOAN', 'ADVANCE']).optional().default('LOAN'), principalAmount: z.number().positive(), emiAmount: z.number().positive(), startDate: z.string().min(1), endDate: z.string().optional().nullable() });
const repaymentSchema = z.object({ amount: z.number().positive(), paidOn: z.string().optional(), payrollRecordId: z.number().int().optional().nullable() });
const reimbursementSchema = z.object({ employeeId: z.number().int().positive(), componentCode: z.string().max(40).optional().nullable(), claimDate: z.string().min(1), amount: z.number().positive(), description: z.string().max(500).optional().nullable(), receiptPath: z.string().max(500).optional().nullable() });

// ============ SALARY STRUCTURE ============

router.post(
  '/payroll/salary-structures',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(salaryStructureSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.createSalaryStructure(req.user, req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/payroll/salary-structures/:employeeId',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayrollService.getSalaryStructure(req.user, req.params.employeeId);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/payroll/salary-structures/:id',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(updateSalaryStructureSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.updateSalaryStructure(req.user, req.params.id, req.body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/payroll/salary-structures',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateQuery(payrollFilterSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.listSalaryStructures(req.user, req.query);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ============ SALARY PAYHEADS ("salary headers" / payhead catalog) ============

router.get(
  '/payroll/payheads',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayrollService.listPayheads(req.user, {
        activeOnly: req.query.activeOnly === 'true',
      });
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/payheads',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(payheadSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.createPayhead(req.user, req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/payroll/payheads/:id',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(updatePayheadSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.updatePayhead(req.user, req.params.id, req.body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/payroll/payheads/:id',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      await PayrollService.deletePayhead(req.user, req.params.id);
      res.json({ message: 'Salary payhead deactivated.' });
    } catch (err) {
      next(err);
    }
  }
);

// ============ SALARY RULES (configurable split: Basic/HRA/PF/ESIC/PT) ============

router.get(
  '/payroll/salary-rules',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayrollService.getSalaryRules(req.user);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/payroll/salary-rules',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(salaryRulesSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.updateSalaryRules(req.user, req.body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/salary-rules/preview',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(salaryPreviewSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.previewSalarySplit(req.user, req.body.ctc);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ============ PAYROLL RECORDS ============

router.get('/payroll/statutory-settings', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try { res.json({ data: await PayrollService.listStatutorySettings(req.user, req.query) }); } catch (err) { next(err); }
});
router.post('/payroll/statutory-settings', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(statutorySettingSchema), async (req, res, next) => {
  try { res.status(201).json({ data: await PayrollService.createStatutorySetting(req.user, req.body) }); } catch (err) { next(err); }
});
router.put('/payroll/statutory-settings/:id', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(statutorySettingUpdateSchema), async (req, res, next) => {
  try { res.json({ data: await PayrollService.updateStatutorySetting(req.user, req.params.id, req.body) }); } catch (err) { next(err); }
});

router.get('/payroll/employees/:employeeId/profile', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try { res.json({ data: await PayrollService.getEmployeePayrollProfile(req.user, req.params.employeeId) }); } catch (err) { next(err); }
});
router.put('/payroll/employees/:employeeId/profile', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(employeePayrollProfileSchema), async (req, res, next) => {
  try { res.json({ data: await PayrollService.upsertEmployeePayrollProfile(req.user, req.params.employeeId, req.body) }); } catch (err) { next(err); }
});
router.get('/payroll/employees/:employeeId/attendance-inputs', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try { res.json({ data: await PayrollService.getAttendancePayrollInputs(req.user, req.params.employeeId, Number(req.query.month), Number(req.query.year), Number(req.query.periodId)) }); } catch (err) { next(err); }
});
router.get('/payroll/employees/:employeeId/loans', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => { try { res.json({ data: await PayrollService.listEmployeeLoans(req.user, req.params.employeeId) }); } catch (err) { next(err); } });
router.post('/payroll/employees/:employeeId/loans', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(loanSchema), async (req, res, next) => { try { res.status(201).json({ data: await PayrollService.createEmployeeLoan(req.user, req.params.employeeId, req.body) }); } catch (err) { next(err); } });
router.post('/payroll/loans/:id/repayments', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(repaymentSchema), async (req, res, next) => { try { res.status(201).json({ data: await PayrollService.recordLoanRepayment(req.user, req.params.id, req.body) }); } catch (err) { next(err); } });
router.get('/payroll/reimbursements', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => { try { res.json({ data: await PayrollService.listReimbursements(req.user, req.query) }); } catch (err) { next(err); } });
router.post('/payroll/reimbursements', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(reimbursementSchema), async (req, res, next) => { try { res.status(201).json({ data: await PayrollService.createReimbursement(req.user, req.body) }); } catch (err) { next(err); } });
router.post('/payroll/reimbursements/:id/:action', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => { try { const action = String(req.params.action).toLowerCase(); if (!['approve', 'reject'].includes(action)) throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Action must be approve or reject.', 400); res.json({ data: await PayrollService.reviewReimbursement(req.user, req.params.id, action === 'approve') }); } catch (err) { next(err); } });

router.post('/payroll/periods', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(payrollPeriodSchema), async (req, res, next) => {
  try {
    const result = await PayrollService.getOrCreatePayrollPeriod(req.user, req.body);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

router.post('/payroll/periods/:id/transition', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(payrollPeriodTransitionSchema), async (req, res, next) => {
  try {
    const result = await PayrollService.transitionPayrollPeriod(req.user, req.params.id, req.body.status, req.body.reason);
    res.json({ data: result });
  } catch (err) { next(err); }
});

router.post(
  '/payroll/records',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(createPayrollSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.createPayroll(req.user, req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/records/bulk',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(bulkPayrollSchema),
  async (req, res, next) => {
    try {
      const results = [];
      for (const employeeId of req.body.employeeIds) {
        const payroll = await PayrollService.createPayroll(req.user, {
          employeeId,
          month: req.body.month,
          year: req.body.year,
          applyAttendanceProration: req.body.applyAttendanceProration,
        });
        results.push(payroll);
      }
      res.status(201).json({ data: results });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/payroll/records/:id/components',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(z.object({ overrides: z.array(componentOverrideSchema) })),
  async (req, res, next) => {
    try {
      const result = await PayrollService.updatePayrollComponents(
        req.user,
        req.params.id,
        req.body.overrides
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/records/:id/submit',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayrollService.submitForApproval(req.user, req.params.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/records/:id/approve',
  authenticate,
  authorize(Role.SUPER_ADMIN),
  validateBody(payrollActionSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.approvePayroll(req.user, req.params.id, req.body.comment);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/records/:id/reject',
  authenticate,
  authorize(Role.SUPER_ADMIN),
  validateBody(payrollActionSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.rejectPayroll(req.user, req.params.id, req.body.comment);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// Record-level lock / unlock / paid. These freeze (or, via the authorized
// unlock path, reopen) an approved calculation so the numbers HR and Finance
// signed off can never silently drift.
router.post(
  '/payroll/records/:id/lock',
  authenticate,
  authorize(Role.SUPER_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayrollService.lockPayroll(req.user, req.params.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/records/:id/unlock',
  authenticate,
  authorize(Role.SUPER_ADMIN),
  validateBody(payrollActionSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.unlockPayroll(req.user, req.params.id, req.body.comment);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/records/:id/paid',
  authenticate,
  authorize(Role.SUPER_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayrollService.markPayrollPaid(req.user, req.params.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// One-time earnings/deductions queued against an employee: bonuses,
// incentives, arrears, advances, correction entries.
router.get(
  '/payroll/one-time-adjustments',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayrollService.listOneTimeAdjustments(req.user, req.query);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/one-time-adjustments',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(oneTimeAdjustmentSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.createOneTimeAdjustment(req.user, req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// Explicit HR / Finance review gates recorded on the period.
router.post(
  '/payroll/periods/:id/review',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(payrollPeriodReviewSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.recordPayrollPeriodReview(req.user, req.params.id, req.body.gate);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/payroll/records/:id',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE),
  async (req, res, next) => {
    try {
      const result = await PayrollService.getPayroll(req.user, req.params.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/payroll/records',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE),
  validateQuery(payrollFilterSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.listPayrolls(req.user, req.query);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ============ PAYSLIPS ============

const PDF_MIME = 'application/pdf';

// Helper: send the PDF buffer with safe headers
function sendPdfResponse(res, buffer, filename) {
  res.setHeader('Content-Type', PDF_MIME);
  res.setHeader('Content-Length', Buffer.byteLength(buffer));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/"/g, "'")}"`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buffer);
}

router.get(
  '/payroll/payslips/:id/pdf',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE),
  async (req, res, next) => {
    try {
      const result = await PayrollService.getPayslipPDF(req.user, req.params.id);
      sendPdfResponse(res, result.pdfBuffer, result.filename);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/payslips/:payrollId',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayrollService.generatePayslip(req.user, req.params.payrollId);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/payroll/payslips/:id',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN, Role.EMPLOYEE),
  async (req, res, next) => {
    try {
      const result = await PayrollService.getPayslip(req.user, req.params.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/payroll/my-payslip',
  authenticate,
  authorize(Role.EMPLOYEE),
  async (req, res, next) => {
    try {
      const { month, year } = req.query;
      if (!month || !year) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'month and year query parameters are required.' },
        });
        return;
      }
      const result = await PayrollService.getMyPayslip(req.user, Number(month), Number(year));
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/payroll/my-payslips',
  authenticate,
  authorize(Role.EMPLOYEE),
  async (req, res, next) => {
    try {
      const result = await PayrollService.listMyPayslips(req.user);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ============ STATS ============

router.get('/payroll/stats', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await PayrollService.getDashboardStats(req.user);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// PF / ESIC deduction report for a month (per-employee breakdown + totals).
router.get('/payroll/statutory-report', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await PayrollService.getStatutoryDeductionReport(req.user, {
      month: req.query.month,
      year: req.query.year,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/payroll/my-summary', authenticate, authorize(Role.EMPLOYEE), async (req, res, next) => {
  try {
    const result = await PayrollService.getMyPayrollSummary(req.user);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// ---- New workflow endpoints (password-confirmed lock, bulk payslips, HR reopen) ----

const passwordConfirmSchema = z.object({ password: z.string().min(1) });
const reopenPeriodSchema = z.object({ reason: z.string().min(3).max(500) });

router.post(
  '/payroll/periods/:id/lock',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(passwordConfirmSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.lockPayrollPeriodWithPassword(req.user, req.params.id, req.body.password);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/periods/:id/generate-payslips',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const result = await PayrollService.generateBulkPayslips(req.user, req.params.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/payroll/periods/:id/reopen',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  validateBody(reopenPeriodSchema),
  async (req, res, next) => {
    try {
      const result = await PayrollService.reopenLockedPeriod(req.user, req.params.id, req.body.reason);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
