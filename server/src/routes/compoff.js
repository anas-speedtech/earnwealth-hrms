const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { CompOffService } = require('../services/compoff.service');
const { Role } = require('../types/index');

const router = express.Router();

const PAGE_SIZE = 20;

// ---- Policy schemas ----

const updatePolicySchema = z.object({
  isEnabled: z.boolean().optional(),
  creditExpiryMonths: z.coerce.number().int().positive().optional().nullable(),
  minWorkingMinutes: z.coerce.number().int().positive().optional().nullable(),
  maxCreditsPerMonth: z.coerce.number().int().positive().optional().nullable(),
  applicableOnWeekends: z.boolean().optional(),
  applicableOnHolidays: z.boolean().optional(),
});

const requestCreditSchema = z.object({
  sourceDate: z.string().min(1),
  attendanceId: z.string().uuid().optional().nullable(),
});

const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().optional().nullable(),
});

const redeemSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  isHalfDay: z.boolean().optional().default(false),
  halfDayPeriod: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional().nullable(),
  reason: z.string().optional().default(''),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  status: z.string().optional(),
  employeeId: z.string().uuid().optional(),
});

// ============ EMPLOYEE ENDPOINTS ============

// Get Comp-Off policy
router.get('/compoff/policy', authenticate, async (req, res, next) => {
  try {
    const result = await CompOffService.getPolicy();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get my Comp-Off balance
router.get('/compoff/balance', authenticate, async (req, res, next) => {
  try {
    const result = await CompOffService.getMyBalance(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get my eligible dates
router.get('/compoff/eligible-dates', authenticate, validateQuery(z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().optional(),
})), async (req, res, next) => {
  try {
    const result = await CompOffService.getEligibleDates(req.user, {
      month: req.query.month ? parseInt(req.query.month) : undefined,
      year: req.query.year ? parseInt(req.query.year) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Submit a Comp-Off credit request
router.post('/compoff/request-credit', authenticate, validateBody(requestCreditSchema), async (req, res, next) => {
  try {
    const result = await CompOffService.requestCredit(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Get my Comp-Off credits
router.get('/compoff/my-credits', authenticate, async (req, res, next) => {
  try {
    const result = await CompOffService.getMyCredits(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get my Comp-Off ledger
router.get('/compoff/ledger', authenticate, validateQuery(z.object({
  page: z.coerce.number().int().positive().default(1),
})), async (req, res, next) => {
  try {
    const result = await CompOffService.getMyLedger(req.user, {
      page: parseInt(req.query.page) || 1,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get Comp-Off credit detail
router.get('/compoff/credits/:id', authenticate, async (req, res, next) => {
  try {
    const result = await CompOffService.getCreditDetail(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Apply for Comp-Off leave (redeem credits)
router.post('/compoff/apply-leave', authenticate, validateBody(redeemSchema), async (req, res, next) => {
  try {
    const result = await CompOffService.redeemCredit(req.user, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// Get my Comp-Off leave requests
router.get('/compoff/my-leaves', authenticate, validateQuery(z.object({
  page: z.coerce.number().int().positive().default(1),
  status: z.string().optional(),
})), async (req, res, next) => {
  try {
    const prismaClient = getPrisma();
    // employees.userId is the relation key; employeeProfile is not a model.
    const profile = await prismaClient.employee.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!profile) {
      return res.status(404).json({ message: 'Employee profile not found.' });
    }

    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * PAGE_SIZE;
    const where = { employeeId: profile.id };
    if (req.query.status) where.status = req.query.status;

    const [leaves, total] = await Promise.all([
      prismaClient.compOffLeave.findMany({ where, skip, take: PAGE_SIZE, orderBy: { createdAt: 'desc' } }),
      prismaClient.compOffLeave.count({ where }),
    ]);

    return res.json({
      requests: leaves.map((l) => ({
        id: l.id,
        startDate: l.startDate,
        endDate: l.endDate,
        isHalfDay: l.isHalfDay,
        totalDays: Number(l.totalDays),
        reason: l.reason,
        status: l.status,
        reviewComment: l.reviewComment,
        reviewedAt: l.reviewedAt,
        createdAt: l.createdAt,
      })),
      pagination: { page, pageSize: PAGE_SIZE, total, pages: Math.ceil(total / PAGE_SIZE) || 1 },
    });
  } catch (err) {
    next(err);
  }
});

// Get pending Comp-Off leave requests (HR)
router.get('/compoff/leaves/pending', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await CompOffService.getPendingCompOffLeaves(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Review a Comp-Off leave request (HR approve/reject)
router.post('/compoff/leaves/:id/review', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reviewComment: z.string().optional().nullable(),
})), async (req, res, next) => {
  try {
    const { action, reviewComment } = req.body;
    const result = await CompOffService.reviewCompOffLeave(req.user, req.params.id, action, reviewComment);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get single Comp-Off leave detail
router.get('/compoff/leaves/:id', authenticate, async (req, res, next) => {
  try {
    const prismaClient = getPrisma();
    const leave = prismaClient.compOffLeave.findUnique({
      where: { id: req.params.id },
      include: {
        employee: {
          include: {
            user: { select: { email: true } },
            department: { select: { name: true } },
          },
        },
      },
    });
    if (!leave) {
      return res.status(404).json({ message: 'Comp-Off leave not found.' });
    }
    const isSelf = req.user.id === leave.employee.userId;
    const isHR = [Role.SUPER_ADMIN, Role.HR_ADMIN].includes(req.user.role);
    if (!isSelf && !isHR) {
      return res.status(403).json({ message: 'You do not have permission to view this leave.' });
    }
    return res.json({
      id: leave.id,
      employeeId: leave.employeeId,
      employeeName: `${leave.employee.firstName} ${leave.employee.lastName}`,
      employeeCode: leave.employee.employeeCode,
      startDate: leave.startDate,
      endDate: leave.endDate,
      isHalfDay: leave.isHalfDay,
      totalDays: Number(leave.totalDays),
      reason: leave.reason,
      status: leave.status,
      reviewComment: leave.reviewComment,
      reviewedAt: leave.reviewedAt,
      createdAt: leave.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// Cancel my Comp-Off leave request (employee, PENDING only)
router.post('/compoff/leaves/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const prismaClient = getPrisma();
    const profile = prismaClient.employeeProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!profile) {
      return res.status(404).json({ message: 'Employee profile not found.' });
    }

    const leave = prismaClient.compOffLeave.findUnique({
      where: { id: req.params.id },
    });
    if (!leave) {
      return res.status(404).json({ message: 'Comp-Off leave not found.' });
    }
    if (leave.employeeId !== profile.id) {
      return res.status(403).json({ message: 'You can only cancel your own requests.' });
    }
    if (leave.status !== 'PENDING') {
      return res.status(409).json({ message: `Cannot cancel a ${leave.status.toLowerCase()} request.` });
    }

    const result = await prismaClient.$transaction(async (tx) => {
      const updated = await tx.compOffLeave.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED' },
      });

      // Restore credits that were deducted
      const ledgerEntries = await tx.compOffLedger.findMany({
        where: { relatedLeaveId: req.params.id, type: 'USED' },
        include: { credit: true },
      });

      for (const entry of ledgerEntries) {
        if (entry.creditId && entry.credit) {
          const restoreAmount = Number(entry.amount);
          const currentRemaining = Number(entry.credit.remainingAmount);
          const newRemaining = currentRemaining + restoreAmount;

          await tx.compOffCredit.update({
            where: { id: entry.creditId },
            data: { remainingAmount: newRemaining, status: 'APPROVED' },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          actorRole: req.user.role,
          action: 'CANCEL_COMPOFF_LEAVE',
          entityType: 'CompOffLeave',
          entityId: req.params.id,
        },
      });

      return updated;
    });

    return res.json({
      id: result.id,
      status: result.status,
      message: 'Comp-Off leave cancelled. Credits restored.',
    });
  } catch (err) {
    next(err);
  }
});

// ============ HR / ADMIN / SUPER_ADMIN ENDPOINTS ============

// Get pending Comp-Off requests
router.get('/compoff/pending', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await CompOffService.getPendingRequests(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Review a Comp-Off credit request
router.post('/compoff/credits/:id/review', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(reviewSchema), async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    const result = await CompOffService.reviewCredit(req.user, req.params.id, action, reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get employee Comp-Off balance (HR view)
router.get('/compoff/employees/:id/balance', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await CompOffService.getEmployeeBalance(req.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// List all Comp-Off credits (HR view)
router.get('/compoff/credits', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateQuery(paginationSchema), async (req, res, next) => {
  try {
    const result = await CompOffService.getAllCredits(req.user, {
      page: parseInt(req.query.page) || 1,
      status: req.query.status,
      employeeId: req.query.employeeId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Process expired credits (HR/Admin/SA)
router.post('/compoff/process-expiry', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const result = await CompOffService.processExpiredCredits(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Update policy (Admin/SA only)
router.put('/compoff/policy', authenticate, authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), validateBody(updatePolicySchema), async (req, res, next) => {
  try {
    const result = await CompOffService.updatePolicy(req.user, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
