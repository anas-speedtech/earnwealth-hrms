const express = require('express');
const cors = require('cors');
const { corsOptions } = require('./config/cors');
const { env } = require('./config/env');

// Route imports
const authRoutes = require('./routes/auth/auth.routes');
const employeeRoutes = require('./routes/employees');
const departmentRoutes = require('./routes/departments');
const designationRoutes = require('./routes/designations');
const attendanceRoutes = require('./routes/attendance');
const attendanceImportRoutes = require('./routes/attendance-import');
const correctionRoutes = require('./routes/attendance-corrections');
const wfhRoutes = require('./routes/wfh');
const leaveRoutes = require('./routes/leaves');
const payrollRoutes = require('./routes/payroll');
const auditLogRoutes = require('./routes/audit-logs');
const compOffRoutes = require('./routes/compoff');
const userRoutes = require('./routes/users');
const holidayRoutes = require('./routes/holidays');
const roleAccessRoutes = require('./routes/role-access');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api', authRoutes);
app.use('/api', employeeRoutes);
app.use('/api', departmentRoutes);
app.use('/api', designationRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', attendanceImportRoutes);
app.use('/api', correctionRoutes);
app.use('/api', wfhRoutes);
app.use('/api', leaveRoutes);
app.use('/api', payrollRoutes);
app.use('/api', auditLogRoutes);
app.use('/api', compOffRoutes);
app.use('/api', userRoutes);
app.use('/api', holidayRoutes);
app.use('/api', roleAccessRoutes);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;

