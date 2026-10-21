const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');

/**
 * Biometric attendance import.
 *
 * Accepts a raw `.dat` file from a biometric device, parses its rows into
 * punch events, matches each row to an employee by Employee Code, and stores
 * the events in `attendance_logs` with a shared `importBatchId` so an import
 * can be reviewed and rolled back as one unit.
 *
 * The device file format expected (one punch per row, a header line allowed):
 *
 *   EmpCode   PunchTime
 *   056       2026-07-21 09:12:04
 *   056       2026-07-21 18:04:11
 *
 * The parser is tolerant of both `YYYY-MM-DD HH:MM:SS` and
 * `DD/MM/YYYY HH:MM:SS` timestamps, and of tab, comma, or whitespace
 * separators. Punches are stored as-is (a day can contain multiple in/out
 * pairs, matching the biometric device's behaviour).
 *
 * Half-day LWP flags (surfaced per row so HR sees them without inference):
 *   - first punch-in of the day later than 09:30 -> lateIn
 *   - last punch-out of the day earlier than 18:30 -> earlyOut
 */

const LATE_IN_THRESHOLD = '09:30:00';
const EARLY_OUT_THRESHOLD = '18:30:00';

class AttendanceImportService {
  static canImport(reqUser) {
    return [Role.SUPER_ADMIN, Role.HR_ADMIN].includes(reqUser.role);
  }

  static getPrisma() {
    const { PrismaClient } = require('@prisma/client');
    if (!this._prisma) {
      this._prisma = new PrismaClient();
    }
    return this._prisma;
  }

  static resetPrisma() {
    this._prisma = null;
  }

  /**
   * Parses the raw text of a biometric `.dat` export into normalized rows.
   * @param {string} raw text content of the uploaded file
   */
  static parseDat(raw) {
    const lines = String(raw || '')
      .split(/\r?\n/)
      .map((line) => line.replace(/\t/g, ' ').trim())
      .filter(Boolean);

    const parsedRows = [];
    const skipped = [];

    for (const line of lines) {
      // Skip header rows (a punch code always starts with a digit).
      if (!/^\d/.test(line)) continue;

      // A single-space split misses the time, which would leave no timestamp.
      // Split on any run of whitespace or a comma/semicolon: this covers
      // single-spaced, tab-separated, and comma-separated device exports.
      const parts = line.split(/\s+|[,;]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) {
        skipped.push({ line, reason: 'Unrecognized row' });
        continue;
      }

      const employeeCode = parts[0];
      const timePart = parts.slice(1).join(' ');
      const parsedTime = this.parseTimestamp(timePart);
      if (!parsedTime) {
        skipped.push({ line, reason: 'Unrecognized timestamp: "' + timePart + '"' });
        continue;
      }

      // Store as a local datetime string (YYYY-MM-DD HH:MM:SS). The live
      // `punchTime` column is a DATETIME and rejects ISO-8601 strings with a
      // timezone suffix, so the parsed local value is written back in the
      // format the column expects.
      const local = [
        String(parsedTime.getMonth() + 1).padStart(2, '0'),
        String(parsedTime.getDate()).padStart(2, '0'),
      ];
      const punchTime =
        parsedTime.getFullYear() + '-' + local[0] + '-' + local[1] + ' ' +
        String(parsedTime.getHours()).padStart(2, '0') + ':' +
        String(parsedTime.getMinutes()).padStart(2, '0') + ':' +
        String(parsedTime.getSeconds()).padStart(2, '0');
      parsedRows.push({ employeeCode, punchTime });
    }

    return { rows: parsedRows, skipped };
  }

  static parseTimestamp(text) {
    const s = String(text || '').trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0);
    }

    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0);
    }

    return null;
  }

  /**
   * Full import. Resolves codes to employees, determines IN/OUT per event,
   * and writes both the audit row and the attendance events.
   *
   * @returns {Promise<{importId:number, matched:number, skipped:Array, unmatched:Array}>}
   */
  static async import(reqUser, { raw, fileName, note }) {
    if (!this.canImport(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only HR Admin or Super Admin can import attendance.', 403);
    }

    const { rows, skipped } = this.parseDat(raw);
    if (!rows.length && !skipped.length) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'The file contained no recognizable punch rows.', 400);
    }

    const prisma = this.getPrisma();

    // Resolve employee codes to employee ids.
    //
    // The live MariaDB server rejects a multi-value `IN (?, ?)` placeholder
    // list in $queryRawUnsafe (it parses the list of bare `?` as a syntax
    // error), so each code is resolved individually instead. The code set is
    // small (distinct employees in one file), so the extra round-trips are
    // negligible.
    const codes = Array.from(new Set(rows.map((r) => r.employeeCode)));
    const empByCode = new Map();
    for (const code of codes) {
      const rows_ = await prisma.$queryRawUnsafe(
        'SELECT id, employeeCode FROM employees WHERE employeeCode = ? AND isActive = 1 LIMIT 1',
        code
      );
      if (rows_ && rows_.length) {
        empByCode.set(code, Number(rows_[0].id));
      }
    }
    const codeToEmployee = empByCode;
    const unmatchedCodes = codes.filter((c) => !codeToEmployee.has(c));

    // Determine IN/OUT by ordering that employee's punches for the day: the
    // first event of a day is a punch-in, the second a punch-out, and so on.
    const enriched = rows.map((r) => {
      const employeeId = codeToEmployee.get(r.employeeCode) || null;
      return { ...r, employeeId };
    });

    // Group by employee+day to classify in/out order.
    const byEmpDay = new Map();
    for (const row of enriched) {
      const day = row.punchTime.slice(0, 10);
      const key = row.employeeId ? row.employeeId + '|' + day : 'unmatched|' + day;
      if (!byEmpDay.has(key)) byEmpDay.set(key, []);
      byEmpDay.get(key).push(row);
    }
    for (const list of byEmpDay.values()) {
      list.sort((a, b) => new Date(a.punchTime) - new Date(b.punchTime));
      list.forEach((row, index) => {
        row.status = index % 2 === 0 ? 'IN' : 'OUT';
      });
    }

    // First punch-in after 09:30 -> lateIn; last punch-out before 18:30 -> earlyOut.
    for (const list of byEmpDay.values()) {
      const firstIn = list.find((r) => r.status === 'IN');
      const lastOut = [...list].reverse().find((r) => r.status === 'OUT');
      if (firstIn) firstIn.lateIn = firstIn.punchTime.slice(11, 19) > LATE_IN_THRESHOLD;
      if (lastOut) lastOut.earlyOut = lastOut.punchTime.slice(11, 19) < EARLY_OUT_THRESHOLD;
    }

    const matchable = enriched.filter((r) => r.employeeId);
    const unmatched = enriched.filter((r) => !r.employeeId);
    const failedRows = skipped.length;

    // The live schema has a dedicated `import_batches` table (with an
    // `unknownIds` column for codes that did not resolve to an employee) and
    // `attendance_logs.importBatchId` is a foreign key into it — so the batch
    // row must exist before any punch rows are inserted.
    await prisma.$executeRaw`
      INSERT INTO import_batches
        (fileName, uploadedBy, totalRows, savedRows, duplicateRows, failedRows, unknownIds)
      VALUES (
        ${fileName || 'upload.dat'},
        ${Number(reqUser.id)},
        ${rows.length},
        ${matchable.length},
        0,
        ${failedRows},
        ${unmatchedCodes.length ? unmatchedCodes.join(',') : null}
      )
    `;
    const batchRows = await prisma.$queryRaw`
      SELECT id FROM import_batches ORDER BY id DESC LIMIT 1
    `;
    const importId = Number(batchRows[0].id);

    // Rows that already exist for the same employee+punchTime are duplicates
    // (a re-import of the same export). Count them but do not fail the batch.
    let duplicates = 0;
    for (const row of matchable) {
      const dup = await prisma.$queryRawUnsafe(
        'SELECT id FROM attendance_logs WHERE employeeId = ? AND punchTime = ? LIMIT 1',
        row.employeeId,
        row.punchTime,
      );
      if (dup && dup.length) {
        duplicates++;
        continue;
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO attendance_logs
           (employeeId, punchTime, status, source, importBatchId, createdAt)
         VALUES (?, ?, ?, 'DAT', ?, NOW(3))`,
        row.employeeId,
        row.punchTime,
        row.status,
        importId,
      );
    }
    // Record the duplicate count on the batch row.
    if (duplicates > 0) {
      await prisma.$executeRawUnsafe(
        'UPDATE import_batches SET duplicateRows = ? WHERE id = ?',
        duplicates,
        importId,
      );
    }

    logger.info('Attendance import completed', {
      importId,
      matched: matchable.length,
      duplicates,
      skipped: skipped.length,
      unmatched: unmatchedCodes.length,
      actorId: reqUser.id,
    });

    return {
      importId,
      matched: matchable.length,
      duplicates,
      skipped,
      unmatched: unmatchedCodes,
    };
  }

  static async insertRows(prisma, batchId, rows) {
    for (const row of rows) {
      // `source` is an ENUM('DAT','MANUAL') in the live schema, so an
      // imported device row is stored under 'DAT' (device data). The
      // importBatchId column carries which batch a row came from.
      await prisma.$executeRawUnsafe(
        `INSERT INTO attendance_logs
           (employeeId, punchTime, status, source, importBatchId, createdAt)
         VALUES (?, ?, ?, 'DAT', ?, NOW(3))`,
        row.employeeId,
        row.punchTime,
        row.status,
        batchId,
      );
    }
  }

  static async listImports(reqUser) {
    if (!this.canImport(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'Only HR Admin or Super Admin can view imports.', 403);
    }
    const prisma = this.getPrisma();
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, fileName, uploadedBy, totalRows, savedRows, duplicateRows, failedRows,
              unknownIds, createdAt
       FROM import_batches ORDER BY id DESC LIMIT 20`
    );
    return rows.map((r) => ({
      id: Number(r.id),
      fileName: r.fileName,
      importedBy: Number(r.uploadedBy),
      totalRows: Number(r.totalRows),
      savedRows: Number(r.savedRows),
      duplicateRows: Number(r.duplicateRows),
      failedRows: Number(r.failedRows),
      unknownCodes: r.unknownIds ? String(r.unknownIds).split(',') : [],
      importedAt: r.createdAt,
    }));
  }
}

module.exports = { AttendanceImportService, LATE_IN_THRESHOLD, EARLY_OUT_THRESHOLD };
