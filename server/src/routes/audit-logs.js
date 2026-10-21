const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validate');
const { AuditService } = require('../services/audit.service');
const { Role } = require('../types/index');

const router = express.Router();

// Only the Super Admin may read the audit trail. This is enforced on the server
// for every request; the sidebar link is presentation only.
const AUDIT_READERS = [Role.SUPER_ADMIN];

const auditFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().min(1).max(100).optional(),
  entityType: z.string().min(1).max(100).optional(),
  actorId: z.string().min(1).max(64).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().max(120).optional(),
});

// List audit entries, newest first.
router.get(
  '/audit-logs',
  authenticate,
  authorize(...AUDIT_READERS),
  validateQuery(auditFilterSchema),
  async (req, res, next) => {
    try {
      const result = await AuditService.list(req.user, req.query);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// Distinct actions and entity types, for the filter dropdowns.
router.get(
  '/audit-logs/filters',
  authenticate,
  authorize(...AUDIT_READERS),
  async (req, res, next) => {
    try {
      const result = await AuditService.getFilterOptions(req.user);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
