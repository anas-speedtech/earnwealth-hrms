const express = require('express');
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/auth');
const { AttendanceImportService } = require('../services/attendance-import.service');
const { Role } = require('../types/index');

const router = express.Router();

// Biometric exports are plain-text `.dat` files, well under a few MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept .dat (the standard biometric export) and fall back to any text
    // payload so the flow is not blocked by an extension mismatch.
    cb(null, true);
  },
});

// Upload and import a biometric .dat file. The raw file body is parsed, rows
// are matched to employees by code, and the events are written to
// attendance_logs under one import batch.
router.post(
  '/attendance/import',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        const err = new Error('A .dat file is required.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      const raw = req.file.buffer.toString('utf8');
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
      const result = await AttendanceImportService.import(req.user, {
        raw,
        fileName: req.file.originalname || 'upload.dat',
        note,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// List recent import batches.
router.get(
  '/attendance/imports',
  authenticate,
  authorize(Role.SUPER_ADMIN, Role.HR_ADMIN),
  async (req, res, next) => {
    try {
      const imports = await AttendanceImportService.listImports(req.user);
      res.json({ imports });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
