const { logger } = require('../utils/logger');
const { getPrisma } = require('./auth.service');

/**
 * Personal-profile fields for employees (address, DOB, emergency contact,
 * personal email, personal anniversary date).
 *
 * Stored in a dedicated `employee_personal_profiles` table joined by employee
 * code (the live identity that links the biometric/HR records), mirroring
 * the role_access ensure-table pattern: the table is created idempotently so
 * the module works against a live DB without a migration step.
 */
class PersonalProfileService {
  static ensureTable(prismaClient) {
    return prismaClient.$queryRaw`
      CREATE TABLE IF NOT EXISTS employee_personal_profiles (
        id              INT(11)      NOT NULL AUTO_INCREMENT,
        employeeCode   VARCHAR(50)   NOT NULL,
        address        VARCHAR(500)  DEFAULT NULL,
        dateOfBirth    DATE          DEFAULT NULL,
        emergencyContact VARCHAR(100) DEFAULT NULL,
        personalEmail  VARCHAR(255)  DEFAULT NULL,
        anniversaryDate DATE         DEFAULT NULL,
        createdAt      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY employee_personal_profiles_code_key (employeeCode)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;
  }

  /** The employee code the calling user is linked to (employees, else employee_profiles). */
  static async resolveEmployeeCode(prismaClient, userId) {
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT COALESCE(e.employeeCode, ep.employeeCode) AS employeeCode
       FROM users u
       LEFT JOIN employees e ON e.userId = u.id
       LEFT JOIN employee_profiles ep ON ep.userId = u.id
       WHERE u.id = ? LIMIT 1`,
      Number(userId)
    );
    return rows && rows.length ? rows[0].employeeCode || null : null;
  }

  static emptyProfile() {
    return {
      address: '',
      dateOfBirth: '',
      emergencyContact: '',
      personalEmail: '',
      anniversaryDate: '',
    };
  }

  /** Reads (or the empty shape for) the caller's personal profile. */
  static async getForUser(userId) {
    const prismaClient = getPrisma();
    await this.ensureTable(prismaClient);
    const code = await this.resolveEmployeeCode(prismaClient, userId);
    if (!code) return null; // system accounts with no employee record

    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT address, dateOfBirth, emergencyContact, personalEmail, anniversaryDate
       FROM employee_personal_profiles WHERE employeeCode = ? LIMIT 1`,
      code
    );
    if (!rows || !rows.length) return this.emptyProfile();

    const r = rows[0];
    const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
    return {
      address: r.address || '',
      dateOfBirth: day(r.dateOfBirth),
      emergencyContact: r.emergencyContact || '',
      personalEmail: r.personalEmail || '',
      anniversaryDate: day(r.anniversaryDate),
    };
  }

  /** Reads the personal profile for a given employee code (or the empty shape). */
  static async getForEmployeeCode(employeeCode) {
    const prismaClient = getPrisma();
    await this.ensureTable(prismaClient);
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT address, dateOfBirth, emergencyContact, personalEmail, anniversaryDate
       FROM employee_personal_profiles WHERE employeeCode = ? LIMIT 1`,
      employeeCode
    );
    if (!rows || !rows.length) return this.emptyProfile();

    const r = rows[0];
    const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
    return {
      address: r.address || '',
      dateOfBirth: day(r.dateOfBirth),
      emergencyContact: r.emergencyContact || '',
      personalEmail: r.personalEmail || '',
      anniversaryDate: day(r.anniversaryDate),
    };
  }

  /** Upserts the calling user's personal profile. Dates are `YYYY-MM-DD` strings. */
  static async upsertForUser(userId, data) {
    const prismaClient = getPrisma();
    await this.ensureTable(prismaClient);
    const code = await this.resolveEmployeeCode(prismaClient, userId);
    if (!code) {
      throw new Error('No employee record is linked to this account.');
    }
    return this.upsertForEmployeeCode(code, data);
  }

  /**
   * Upserts the personal profile for a given employee code. This is the
   * HR-maintained path: because employees no longer self-edit (the /me PUT is
   * HR-gated), HR Admin / Super Admin write these fields on the employee's
   * behalf, keyed by their employee code.
   */
  static async upsertForEmployeeCode(employeeCode, data) {
    const prismaClient = getPrisma();
    await this.ensureTable(prismaClient);

    const clean = (v) => (v && String(v).trim() ? String(v).trim() : null);
    const dayOnly = (v) =>
      v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v).slice(0, 10) : null;

    const address = clean(data.address);
    const dateOfBirth = dayOnly(data.dateOfBirth);
    const emergencyContact = clean(data.emergencyContact);
    const personalEmail = clean(data.personalEmail);
    const anniversaryDate = dayOnly(data.anniversaryDate);

    await prismaClient.$queryRawUnsafe(
      `INSERT INTO employee_personal_profiles
         (employeeCode, address, dateOfBirth, emergencyContact, personalEmail, anniversaryDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         address = VALUES(address),
         dateOfBirth = VALUES(dateOfBirth),
         emergencyContact = VALUES(emergencyContact),
         personalEmail = VALUES(personalEmail),
         anniversaryDate = VALUES(anniversaryDate),
         updatedAt = NOW(3)`,
      employeeCode,
      address,
      dateOfBirth,
      emergencyContact,
      personalEmail,
      anniversaryDate
    );

    logger.info('Personal profile updated by HR', { employeeCode });
    return this.getForEmployeeCode(employeeCode);
  }

  /**
   * HR-facing access by employee record id. The `employees.id` is what the
   * employee-detail page works with; the personal profile is keyed by code,
   * so these resolve the id → code and delegate. Route-level `authorize`
   * limits these to HR Admin / Super Admin.
   */
  static async resolveCodeForEmployee(prismaClient, employeeId) {
    const rows = await prismaClient.$queryRawUnsafe(
      'SELECT employeeCode FROM employees WHERE id = ? LIMIT 1',
      Number(employeeId)
    );
    if (!rows || !rows.length) return null;
    return rows[0].employeeCode;
  }

  /** Read the personal profile for one employee record (HR view). null = no record. */
  static async getForEmployeeId(employeeId) {
    const prismaClient = getPrisma();
    await this.ensureTable(prismaClient);
    const code = await this.resolveCodeForEmployee(prismaClient, employeeId);
    if (!code) return null;
    return this.getForEmployeeCode(code);
  }

  /** Write the personal profile for one employee record (HR edit). */
  static async upsertForEmployeeId(employeeId, data) {
    const prismaClient = getPrisma();
    await this.ensureTable(prismaClient);
    const code = await this.resolveCodeForEmployee(prismaClient, employeeId);
    if (!code) {
      throw new Error('Employee record not found for this employee id.');
    }
    return this.upsertForEmployeeCode(code, data);
  }
}

module.exports = { PersonalProfileService };
