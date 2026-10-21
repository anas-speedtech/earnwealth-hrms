const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { RoleAccessService } = require('../services/role-access.service');
const { Role } = require('../types/index');

const router = express.Router();

const updateSchema = z.object({
  view: z.boolean(),
  edit: z.boolean(),
});

router.use(authenticate);

// Super Admin and HR Admin may view the grants; only Super Admin may edit.
router.get('/roles/access', authorize(Role.SUPER_ADMIN, Role.HR_ADMIN), async (req, res, next) => {
  try {
    const roles = await RoleAccessService.list(req.user);
    res.json({ roles });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/roles/access/:key',
  authorize(Role.SUPER_ADMIN),
  validateBody(updateSchema),
  async (req, res, next) => {
    try {
      const roles = await RoleAccessService.update(req.user, req.params.key, req.body);
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
