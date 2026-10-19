const { PrismaClient } = require('@prisma/client');
const { AppError, AppErrorCodes } = require('../errors/AppError');
const { Role } = require('../types/index');
const { logger } = require('../utils/logger');

let prisma;

function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

const PAGE_SIZE = 20;

class EmployeeService {
  static canAccessAll(reqUser) {
    return reqUser.role === Role.SUPER_ADMIN || reqUser.role === Role.HR_ADMIN || reqUser.role === Role.HR_ADMIN;
  }

  static async list(reqUser, { page = 1, search = '', departmentId = '', designationId = '', status = '' }) {
    if (!this.canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view employees.', 403);
    }

    const prismaClient = getPrisma();

    const safePage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    const limit = PAGE_SIZE;
    const offset = (safePage - 1) * PAGE_SIZE;

    const whereParts = ['1 = 1'];
    const countParams = [];
    const params = [];

    if (search) {
      whereParts.push('(e.employeeCode LIKE ? OR e.name LIKE ? OR e.designation LIKE ?)');
      const searchParam = `%${search}%`;
      countParams.push(searchParam, searchParam, searchParam);
      params.push(searchParam, searchParam, searchParam);
    }

    if (departmentId) {
      whereParts.push('e.departmentId = ?');
      countParams.push(departmentId);
      params.push(departmentId);
    }

    if (status === 'ACTIVE') {
      whereParts.push('e.isActive = 1');
    } else if (status === 'INACTIVE') {
      whereParts.push('e.isActive = 0');
    }

    const whereClause = whereParts.join(' AND ');
    const countRows = await prismaClient.$queryRawUnsafe(
      `SELECT COUNT(*) AS count
       FROM employees e
       LEFT JOIN departments d ON d.id = e.departmentId
       LEFT JOIN users u ON u.id = e.userId
       WHERE ${whereClause}`,
      ...countParams
    );
    const total = countRows && countRows[0] ? Number(countRows[0].count) : 0;

    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT e.id, e.userId, e.employeeCode, e.name, e.designation, e.joiningDate,
              e.departmentText, e.isActive, d.id AS departmentId, d.name AS departmentName, u.email
       FROM employees e
       LEFT JOIN departments d ON d.id = e.departmentId
       LEFT JOIN users u ON u.id = e.userId
       WHERE ${whereClause}
       ORDER BY e.id DESC
       LIMIT ? OFFSET ?`,
      ...params,
      limit,
      offset
    );

    const employees = (rows || []).map((e) => {
      const nameParts = String(e.name || '').trim().split(/\s+/);
      const firstName = nameParts.length ? nameParts[0] : '';
      const lastName = nameParts.slice(1).join(' ');
      return {
        id: String(e.id),
        userId: e.userId == null ? null : String(e.userId),
        employeeCode: e.employeeCode || '',
        firstName,
        lastName,
        email: e.email || '',
        phoneNumber: null,
        department: e.departmentId == null ? null : { id: String(e.departmentId), name: e.departmentName || e.departmentText || '' },
        designation: e.designation ? { id: '', name: e.designation } : null,
        employmentType: null,
        joiningDate: e.joiningDate,
        status: e.isActive ? 'ACTIVE' : 'INACTIVE',
        accountStatus: e.isActive ? 'ACTIVE' : 'INACTIVE',
      };
    });

    const pages = Math.ceil(total / PAGE_SIZE) || 1;

    return {
      employees,
      data: employees,
      pagination: { page: safePage, pageSize: PAGE_SIZE, total, pages },
    };
  }



  static async getById(reqUser, employeeProfileId) {
    const prismaClient = getPrisma();
    const rows = await prismaClient.$queryRawUnsafe(
      `SELECT e.id, e.userId, e.employeeCode, e.name, e.designation, e.joiningDate,
              e.departmentText, e.basicSalary, e.allowances, e.deductions, e.isActive,
              d.id AS departmentId, d.name AS departmentName, u.email
       FROM employees e
       LEFT JOIN departments d ON d.id = e.departmentId
       LEFT JOIN users u ON u.id = e.userId
       WHERE e.id = ?
       LIMIT 1`,
      employeeProfileId
    );

    if (!rows || !rows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    const profile = rows[0];
    const isSelf = reqUser.id === String(profile.userId);
    if (!isSelf && !this.canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to view this profile.', 403);
    }

    const nameParts = String(profile.name || '').trim().split(/\\s+/);
    const firstName = nameParts.length ? nameParts[0] : '';
    const lastName = nameParts.slice(1).join(' ');

    return {
      id: String(profile.id),
      userId: profile.userId == null ? null : String(profile.userId),
      employeeCode: profile.employeeCode || '',
      firstName,
      lastName,
      dateOfBirth: null,
      gender: null,
      phoneNumber: null,
      personalEmail: null,
      address: null,
      department: profile.departmentId == null ? null : { id: String(profile.departmentId), name: profile.departmentName || profile.departmentText || '' },
      designation: profile.designation ? { id: '', name: profile.designation } : null,
      manager: null,
      employmentType: null,
      joiningDate: profile.joiningDate,
      basicSalary: profile.basicSalary,
      allowances: profile.allowances,
      deductions: profile.deductions,
      status: profile.isActive ? 'ACTIVE' : 'INACTIVE',
      email: profile.email || '',
      accountStatus: profile.isActive ? 'ACTIVE' : 'INACTIVE',
    };
  }

  static async create(reqUser, data) {
    if (!this.canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to create employees.', 403);
    }

    const prismaClient = getPrisma();

    const firstName = (data.firstName || '').trim();
    const lastName = (data.lastName || '').trim();
    const name = (firstName + ' ' + lastName).trim();
    const employeeCode = (data.employeeCode || '').trim();

    if (!employeeCode) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Employee code is required.', 400);
    }
    if (!name) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Employee name is required.', 400);
    }
    if (!data.joiningDate) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Joining date is required.', 400);
    }

    const dateValue = new Date(data.joiningDate);
    if (Number.isNaN(dateValue.getTime())) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid joining date.', 400);
    }

    const requiredNumericFields = ['deviceEnrollNo', 'basicSalary', 'allowances', 'deductions'];
    const numericValues = {};
    for (const field of requiredNumericFields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Missing required employee field: ' + field + '.', 400);
      }
      const value = Number(data[field]);
      if (!Number.isFinite(value)) {
        throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid employee field: ' + field + '.', 400);
      }
      numericValues[field] = value;
    }

    const existingCode = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM employees WHERE employeeCode = ? LIMIT 1',
      employeeCode
    );
    if (existingCode && existingCode.length) {
      throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'An employee with this code already exists.', 409);
    }

    let departmentId = null;
    let departmentText = data.departmentText || null;

    if (data.departmentId) {
      const deptRows = await prismaClient.$queryRawUnsafe(
        'SELECT id, name FROM departments WHERE id = ? AND isActive = 1',
        data.departmentId
      );
      if (!deptRows || !deptRows.length) {
        throw new AppError(AppErrorCodes.INVALID_INPUT, 'Invalid department selected.', 400);
      }
      departmentId = Number(deptRows[0].id);
      departmentText = deptRows[0].name;
    }

    const designation = (data.designation || data.designationId || '').trim();
    const status = data.status || 'ACTIVE';
    const isActive = status === 'ACTIVE' ? 1 : 0;

    await prismaClient.$executeRawUnsafe(
      'INSERT INTO employees (employeeCode, name, designation, joiningDate, deviceEnrollNo, basicSalary, allowances, deductions, isActive, departmentId, departmentText, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))',
      employeeCode,
      name,
      designation,
      dateValue.toISOString().slice(0, 10),
      numericValues.deviceEnrollNo,
      numericValues.basicSalary,
      numericValues.allowances,
      numericValues.deductions,
      isActive,
      departmentId,
      departmentText,
      data.userId ? Number(data.userId) : null
    );

    const insertedRows = await prismaClient.$queryRawUnsafe(
      'SELECT id FROM employees WHERE employeeCode = ? ORDER BY id DESC LIMIT 1',
      employeeCode
    );
    const inserted = insertedRows && insertedRows[0];
    if (!inserted) {
      throw new AppError(AppErrorCodes.INTERNAL_ERROR, 'Employee creation failed.', 500);
    }

    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: String(reqUser.id),
          actorRole: reqUser.role,
          action: 'CREATE_EMPLOYEE',
          entityType: 'Employee',
          entityId: String(inserted.id),
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'CREATE_EMPLOYEE', error: err.message });
    }

    logger.info('Employee created', { employeeId: inserted.id, actorId: reqUser.id });

    return {
      id: String(inserted.id),
      employeeCode,
      firstName,
      lastName,
      designation,
      joiningDate: dateValue.toISOString().slice(0, 10),
      departmentId,
      department: departmentId ? { id: String(departmentId), name: departmentText || '' } : null,
      status,
      accountStatus: status,
    };
  }

  static async update(reqUser, employeeProfileId, data) {
    if (!this.canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to update employees.', 403);
    }

    const prismaClient = getPrisma();

    const existingRows = await prismaClient.$queryRawUnsafe(
      'SELECT id, name, designation, departmentId, departmentText, isActive, joiningDate, employeeCode, basicSalary, allowances, deductions FROM employees WHERE id = ? LIMIT 1',
      employeeProfileId
    );

    if (!existingRows || !existingRows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    const existing = existingRows[0];

    if (data.employeeCode !== undefined) {
      const nextCode = String(data.employeeCode || '').trim();
      if (!nextCode) {
        throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Employee code is required.', 400);
      }
      if (nextCode !== existing.employeeCode) {
        const duplicateRows = await prismaClient.$queryRawUnsafe(
          'SELECT id FROM employees WHERE employeeCode = ? AND id <> ? LIMIT 1',
          nextCode,
          employeeProfileId
        );
        if (duplicateRows && duplicateRows.length) {
          throw new AppError(AppErrorCodes.DUPLICATE_ENTRY, 'An employee with this code already exists.', 409);
        }
      }
    }

    if (data.departmentId !== undefined && data.departmentId) {
      const deptRows = await prismaClient.$queryRawUnsafe(
        'SELECT id, name FROM departments WHERE id = ? AND isActive = 1',
        data.departmentId
      );
      if (!deptRows || !deptRows.length) {
        throw new AppError(AppErrorCodes.INVALID_INPUT, 'Invalid department selected.', 400);
      }
    }

    const updates = [];
    const values = [];

    if (data.employeeCode !== undefined) {
      updates.push('employeeCode = ?');
      values.push(String(data.employeeCode).trim());
    }

    const firstName = data.firstName !== undefined ? String(data.firstName).trim() : null;
    const lastName = data.lastName !== undefined ? String(data.lastName).trim() : null;
    if (firstName !== null || lastName !== null) {
      const existingName = String(existing.name || '').trim().split(/\s+/);
      const nextFirst = firstName !== null ? firstName : (existingName[0] || '');
      const nextLast = lastName !== null ? lastName : existingName.slice(1).join(' ');
      updates.push('name = ?');
      values.push((nextFirst + ' ' + nextLast).trim());
    }

    if (data.designation !== undefined) {
      updates.push('designation = ?');
      values.push(String(data.designation || '').trim());
    }

    if (data.designationId !== undefined && data.designation === undefined) {
      updates.push('designation = ?');
      values.push(String(data.designationId || '').trim());
    }

    if (data.departmentId !== undefined) {
      if (!data.departmentId) {
        updates.push('departmentId = NULL');
        updates.push('departmentText = NULL');
      } else {
        const deptRows = await prismaClient.$queryRawUnsafe(
          'SELECT id, name FROM departments WHERE id = ? AND isActive = 1',
          data.departmentId
        );
        if (!deptRows || !deptRows.length) {
          throw new AppError(AppErrorCodes.INVALID_INPUT, 'Invalid department selected.', 400);
        }
        updates.push('departmentId = ?');
        values.push(Number(deptRows[0].id));
        updates.push('departmentText = ?');
        values.push(String(deptRows[0].name || ''));
      }
    }

    if (data.status !== undefined) {
      const status = String(data.status).toUpperCase();
      if (!['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED'].includes(status)) {
        throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid employee status.', 400);
      }
      updates.push('isActive = ?');
      values.push(status === 'ACTIVE' ? 1 : 0);
    }

    if (data.joiningDate !== undefined) {
      const dateValue = new Date(data.joiningDate);
      if (Number.isNaN(dateValue.getTime())) {
        throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid joining date.', 400);
      }
      updates.push('joiningDate = ?');
      values.push(dateValue.toISOString().slice(0, 10));
    }

    const numericUpdates = ['basicSalary', 'allowances', 'deductions'];
    for (const field of numericUpdates) {
      if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
        const value = Number(data[field]);
        if (!Number.isFinite(value) || value < 0) {
          throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'Invalid employee field: ' + field + '.', 400);
        }
        updates.push(field + ' = ?');
        values.push(value);
      }
    }

    if (updates.length === 0) {
      throw new AppError(AppErrorCodes.VALIDATION_ERROR, 'No supported employee fields were provided.', 400);
    }

    updates.push('updatedAt = NOW(3)');
    const sql = 'UPDATE employees SET ' + updates.join(', ') + ' WHERE id = ?';
    values.push(employeeProfileId);

    const affected = await prismaClient.$executeRawUnsafe(sql, ...values);
    if (affected !== 1) {
      throw new AppError(AppErrorCodes.INTERNAL_ERROR, 'Employee update failed.', 500);
    }

    const updatedRows = await prismaClient.$queryRawUnsafe(
      'SELECT id, employeeCode, name, designation, departmentId, departmentText, joiningDate, basicSalary, allowances, deductions, isActive FROM employees WHERE id = ? LIMIT 1',
      employeeProfileId
    );
    const updated = updatedRows && updatedRows[0];

    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: String(reqUser.id),
          actorRole: reqUser.role,
          action: 'UPDATE_EMPLOYEE',
          entityType: 'Employee',
          entityId: String(employeeProfileId),
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'UPDATE_EMPLOYEE', error: err.message });
    }

    logger.info('Employee updated', { employeeId: employeeProfileId, actorId: reqUser.id });

    return {
      id: String(updated.id),
      employeeCode: updated.employeeCode,
      firstName: String(updated.name || '').trim().split(/\s+/)[0] || '',
      lastName: String(updated.name || '').trim().split(/\s+/).slice(1).join(' '),
      designation: updated.designation ? { id: '', name: updated.designation } : null,
      department: updated.departmentId ? { id: String(updated.departmentId), name: updated.departmentText || '' } : null,
      joiningDate: updated.joiningDate,
      basicSalary: updated.basicSalary,
      allowances: updated.allowances,
      deductions: updated.deductions,
      status: updated.isActive ? 'ACTIVE' : 'INACTIVE',
    };
  }

  static async deactivate(reqUser, employeeProfileId) {
    if (!this.canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to deactivate employees.', 403);
    }

    const prismaClient = getPrisma();
    const existingRows = await prismaClient.$queryRawUnsafe(
      'SELECT id, isActive FROM employees WHERE id = ? LIMIT 1',
      employeeProfileId
    );

    if (!existingRows || !existingRows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    if (!existingRows[0].isActive) {
      throw new AppError(AppErrorCodes.CONFLICT, 'Employee is already deactivated.', 409);
    }

    const affected = await prismaClient.$executeRawUnsafe(
      'UPDATE employees SET isActive = 0, updatedAt = NOW(3) WHERE id = ?',
      employeeProfileId
    );

    if (affected !== 1) {
      throw new AppError(AppErrorCodes.INTERNAL_ERROR, 'Employee deactivation failed.', 500);
    }

    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: String(reqUser.id),
          actorRole: reqUser.role,
          action: 'DEACTIVATE_EMPLOYEE',
          entityType: 'Employee',
          entityId: String(employeeProfileId),
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'DEACTIVATE_EMPLOYEE', error: err.message });
    }

    logger.info('Employee deactivated', { employeeId: employeeProfileId, actorId: reqUser.id });

    return { id: String(employeeProfileId), status: 'INACTIVE' };
  }

  static async activate(reqUser, employeeProfileId) {
    if (!this.canAccessAll(reqUser)) {
      throw new AppError(AppErrorCodes.FORBIDDEN, 'You do not have permission to activate employees.', 403);
    }

    const prismaClient = getPrisma();
    const existingRows = await prismaClient.$queryRawUnsafe(
      'SELECT id, isActive FROM employees WHERE id = ? LIMIT 1',
      employeeProfileId
    );

    if (!existingRows || !existingRows.length) {
      throw new AppError(AppErrorCodes.NOT_FOUND, 'Employee not found.', 404);
    }

    if (existingRows[0].isActive) {
      throw new AppError(AppErrorCodes.CONFLICT, 'Employee is already active.', 409);
    }

    const affected = await prismaClient.$executeRawUnsafe(
      'UPDATE employees SET isActive = 1, updatedAt = NOW(3) WHERE id = ?',
      employeeProfileId
    );

    if (affected !== 1) {
      throw new AppError(AppErrorCodes.INTERNAL_ERROR, 'Employee activation failed.', 500);
    }

    try {
      await prismaClient.auditLog.create({
        data: {
          actorId: String(reqUser.id),
          actorRole: reqUser.role,
          action: 'ACTIVATE_EMPLOYEE',
          entityType: 'Employee',
          entityId: String(employeeProfileId),
        },
      });
    } catch (err) {
      logger.warn('Audit log write failed', { action: 'ACTIVATE_EMPLOYEE', error: err.message });
    }

    logger.info('Employee activated', { employeeId: employeeProfileId, actorId: reqUser.id });

    return { id: String(employeeProfileId), status: 'ACTIVE' };
  }
}

module.exports = { EmployeeService };
