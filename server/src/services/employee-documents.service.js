const { AppError, AppErrorCodes } = require('../errors/AppError');
const { getPrisma } = require('./auth.service');
const { logger } = require('../utils/logger');

/**
 * Optional employee documents (Aadhar, PAN, Address Proof, Bank Details /
 * cancelled cheque, and two free-form slots).
 *
 * Bytes are stored in the `employee_documents` table (LONGBLOB), the same
 * pattern as `user_avatars`: no upload directory, no nginx static block, no
 * filesystem permissions — the file lives in MySQL and rides DB backups.
 * The client sends a base64 data URL (compressed in the browser) so the JSON
 * body stays under the app's 1 MB limit.
 *
 * Keyed by (employeeId, kind). `employeeId` is the payroll-side profile id
 * (employee_profiles.id), resolved from either key by PayrollService.
 */

const KINDS = [
  'AADHAAR',
  'PAN',
  'ADDRESS_PROOF',
  'BANK_DETAILS',
  'OTHER_1',
  'OTHER_2',
];

class EmployeeDocumentsService {
  /** Returns the metadata rows for one employee (no file bytes). */
  static async listForEmployee(reqUser, employeeId) {
    const prismaClient = getPrisma();
    const { PayrollService } = require('./payroll.service');
    const profileKey = await PayrollService.resolveProfileId(prismaClient, employeeId);
    if (!profileKey) return [];

    const rows = await prismaClient.employeeDocument.findMany({
      where: { employeeId: profileKey },
      select: { kind: true, fileName: true, mimeType: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      kind: r.kind,
      fileName: r.fileName || '',
      mimeType: r.mimeType || '',
      uploadedAt: r.createdAt,
      updatedAt: r.updatedAt,
      hasFile: true,
    }));
  }

  /** Upload / replace one document slot. `kind` must be a known slot. */
  static async upload(reqUser, employeeId, kind, dataUrl, fileName) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const raw = String(dataUrl || '').trim();
    if (!raw) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'No document was provided.', 400);
    }
    const match = raw.match(/^data:([a-z0-9\/.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Document must be a base64 data URL.', 400);
    }
    const mimeType = match[1];
    if (!allowed.includes(mimeType)) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Unsupported document type. Use JPG, PNG, WEBP or PDF.', 400);
    }
    const buffer = Buffer.from(match[2], 'base64');
    // The app caps the JSON body at 1 MB and the data URL adds ~33% base64
    // overhead, so the file itself must stay under 1 MB to be uploadable.
    if (buffer.length > 1024 * 1024) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Document is too large (max 1 MB). Compress or use a smaller file.', 400);
    }
    const kindKey = String(kind || '').toUpperCase();
    if (!KINDS.includes(kindKey)) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Unknown document slot.', 400);
    }

    const prismaClient = getPrisma();
    const { PayrollService } = require('./payroll.service');
    const profileKey = await PayrollService.resolveProfileId(prismaClient, employeeId);
    if (!profileKey) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    const existing = await prismaClient.employeeDocument.findUnique({
      where: { employeeId_kind: { employeeId: profileKey, kind: kindKey } },
      select: { id: true },
    });

    const saved = existing
      ? await prismaClient.employeeDocument.update({
          where: { id: existing.id },
          data: { data: buffer, mimeType, fileName: String(fileName || '').trim() || null, uploadedBy: Number(reqUser.id) },
        })
      : await prismaClient.employeeDocument.create({
          data: {
            employeeId: profileKey,
            kind: kindKey,
            data: buffer,
            mimeType,
            fileName: String(fileName || '').trim() || null,
            uploadedBy: Number(reqUser.id),
          },
        });

    logger.info('Employee document uploaded', { kind: kindKey, employeeId: profileKey, by: reqUser.id, bytes: buffer.length });
    return {
      kind: saved.kind,
      fileName: saved.fileName || '',
      mimeType: saved.mimeType || '',
      uploadedAt: saved.createdAt,
      hasFile: true,
    };
  }

  /** Fetch one stored document slot back (as a base64 data URL) for preview/download. */
  static async get(reqUser, employeeId, kind) {
    const prismaClient = getPrisma();
    const { PayrollService } = require('./payroll.service');
    const profileKey = await PayrollService.resolveProfileId(prismaClient, employeeId);
    if (!profileKey) return null;

    const kindKey = String(kind || '').toUpperCase();
    if (!KINDS.includes(kindKey)) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Unknown document slot.', 400);
    }
    const row = await prismaClient.employeeDocument.findUnique({
      where: { employeeId_kind: { employeeId: profileKey, kind: kindKey } },
    });
    if (!row) return null;
    return {
      kind: row.kind,
      fileName: row.fileName || '',
      mimeType: row.mimeType || '',
      dataUrl: `data:${row.mimeType || 'application/octet-stream'};base64,${Buffer.from(row.data).toString('base64')}`,
    };
  }

  /** Delete one document slot for an employee. */
  static async remove(reqUser, employeeId, kind) {
    const prismaClient = getPrisma();
    const { PayrollService } = require('./payroll.service');
    const profileKey = await PayrollService.resolveProfileId(prismaClient, employeeId);
    if (!profileKey) return { removed: false };

    const kindKey = String(kind || '').toUpperCase();
    if (!KINDS.includes(kindKey)) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Unknown document slot.', 400);
    }
    const deleted = await prismaClient.employeeDocument.deleteMany({
      where: { employeeId: profileKey, kind: kindKey },
    });
    logger.info('Employee document removed', { kind: kindKey, employeeId: profileKey, affected: deleted.count });
    return { removed: deleted.count > 0 };
  }

  static kinds() {
    return KINDS;
  }
}

module.exports = { EmployeeDocumentsService };
