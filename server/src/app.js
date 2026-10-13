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
const correctionRoutes = require('./routes/attendance-corrections');
const wfhRoutes = require('./routes/wfh');
const leaveRoutes = require('./routes/leaves');
const payrollRoutes = require('./routes/payroll');
const compOffRoutes = require('./routes/compoff');
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
app.use('/api', correctionRoutes);
app.use('/api', wfhRoutes);
app.use('/api', leaveRoutes);
app.use('/api', payrollRoutes);
app.use('/api', compOffRoutes);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;

