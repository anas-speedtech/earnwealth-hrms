const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { PayrollService } = require('../services/payroll.service');
const { Role } = require('../types/index');

const router = express.Router();

// ---- Schemas ----

const salaryStructureSchema = z.object({
  employeeId: z.string().uuid(),
  monthlyCTC: z.number().positive('CTC must be greater than zero'),
  currency: z.string().length(3).default('INR'),
  isActive: z.boolean().optional().default(true),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional().nullable(),
  components: z.array(z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional().nullable(),
    type: z.enum(['EARNING', 'DEDUCTION']),
    calculationType: z.enum(['FIXED', 'PERCENTAGE_OF_CTC', 'PERCENTAGE_OF_BASIC', 'FORMULA']).default('FIXED'),
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
  employeeId: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

const bulkPayrollSchema = z.object({
  departmentId: z.string().uuid().optional(),
  employeeIds: z.array(z.string().uuid()).min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

const payrollFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  employeeId: z.string().uuid().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']).optional(),
  departmentId: z.string().uuid().optional(),
  search: z.string().optional(),
});

const payrollActionSchema = z.object({
  comment: z.string().optional().default(''),
});

const componentOverrideSchema = z.object({
  id: z.string().uuid(),
  amount: z.number(),
});

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

// ============ PAYROLL RECORDS ============

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

router.get('/payroll/my-summary', authenticate, authorize(Role.EMPLOYEE), async (req, res, next) => {
  try {
    const result = await PayrollService.getMyPayrollSummary(req.user);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
