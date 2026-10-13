import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import RoleRoute from './components/layout/RoleRoute';

// Auth pages
import CommonLogin from './pages/auth/CommonLogin';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

// Dashboard pages
import SuperAdminDashboard from './pages/super-admin/Dashboard';
import SuperAdminPayrollApproval from './pages/super-admin/PayrollApproval';
import AdminDashboard from './pages/admin/Dashboard';
import HrDashboard from './pages/hr/Dashboard';
import HrAttendance from './pages/hr/Attendance';
import HrWFH from './pages/hr/WFH';
import HrLeaveApprovals from './pages/hr/LeaveApprovals';
import HRPayroll from './pages/hr/HRPayroll';
import EmployeeDashboard from './pages/employee/Dashboard';
import EmployeeAttendance from './pages/employee/Attendance';
import EmployeeWFH from './pages/employee/WFH';
import EmployeeLeaveBalances from './pages/employee/LeaveBalances';
import EmployeeApplyLeave from './pages/employee/ApplyLeave';
import EmployeeLeaveRequests from './pages/employee/LeaveRequests';
import EmployeePayslipsPage from './pages/employee/Payslips';

// Admin pages
import EmployeeList from './pages/admin/EmployeeList';
import EmployeeCreate from './pages/admin/EmployeeCreate';
import EmployeeDetail from './pages/admin/EmployeeDetail';
import DepartmentList from './pages/admin/DepartmentList';
import DesignationList from './pages/admin/DesignationList';

// Shared pages
import NotFound from './pages/shared/NotFound';
import Unauthorized from './pages/shared/Unauthorized';

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const rolePaths: Record<string, string> = {
    SUPER_ADMIN: '/super-admin/dashboard',
    ADMIN: '/admin/dashboard',
    HR: '/hr/dashboard',
    EMPLOYEE: '/employee/dashboard',
  };

  return <Navigate to={rolePaths[user.role] || '/'} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Root â€” redirects to role dashboard or shows login options */}
            <Route path="/" element={<HomeRedirect />} />

            {/* Login pages */}
            <Route path="/login" element={<CommonLogin />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/super-admin/login" element={<Navigate to="/login" replace />} />
            <Route path="/admin/login" element={<Navigate to="/login" replace />} />
            <Route path="/hr/login" element={<Navigate to="/login" replace />} />
            <Route path="/employee/login" element={<Navigate to="/login" replace />} />

            {/* Super Admin routes */}
            <Route
              path="/super-admin/dashboard"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <SuperAdminDashboard />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/admins"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Admin management â€” coming in Phase 6</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/hrs"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">HR management â€” coming in Phase 6</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/settings"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Settings â€” coming in Phase 6</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/policies"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Policies â€” coming in Phase 6</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/holidays"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Holidays â€” coming in Phase 6</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/audit-logs"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Audit logs â€” coming in Phase 10</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/payroll-approval"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <SuperAdminPayrollApproval />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/reports"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Reports â€” coming in Phase 10</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />

            {/* Admin routes */}
            <Route
              path="/admin/dashboard"
              element={
                <RoleRoute allowedRoles={['ADMIN']}>
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/employees"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'SUPER_ADMIN', 'HR']}>
                  <ProtectedRoute>
                    <EmployeeList />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/employees/new"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'SUPER_ADMIN', 'HR']}>
                  <ProtectedRoute>
                    <EmployeeCreate />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/employees/:id"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'SUPER_ADMIN', 'HR']}>
                  <ProtectedRoute>
                    <EmployeeDetail />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/departments"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'SUPER_ADMIN', 'HR']}>
                  <ProtectedRoute>
                    <DepartmentList />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/designations"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'SUPER_ADMIN', 'HR']}>
                  <ProtectedRoute>
                    <DesignationList />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/attendance"
              element={
                <RoleRoute allowedRoles={['ADMIN']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Attendance review â€” coming in Phase 7</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <RoleRoute allowedRoles={['ADMIN']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Reports â€” coming in Phase 10</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />

            {/* HR routes */}
            <Route
              path="/hr/dashboard"
              element={
                <RoleRoute allowedRoles={['HR']}>
                  <ProtectedRoute>
                    <HrDashboard />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/attendance"
              element={
                <RoleRoute allowedRoles={['HR']}>
                  <ProtectedRoute>
                    <HrAttendance />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/wfh"
              element={
                <RoleRoute allowedRoles={['HR']}>
                  <ProtectedRoute>
                    <HrWFH />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/leaves"
              element={
                <RoleRoute allowedRoles={['HR', 'ADMIN', 'SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <HrLeaveApprovals />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/comp-offs"
              element={
                <RoleRoute allowedRoles={['HR']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Comp-off management â€” coming in Phase 8</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/payroll"
              element={
                <RoleRoute allowedRoles={['HR']}>
                  <ProtectedRoute>
                    <HRPayroll />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/payslips"
              element={
                <RoleRoute allowedRoles={['HR']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Payslips â€” coming in Phase 9</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/reports"
              element={
                <RoleRoute allowedRoles={['HR']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Reports â€” coming in Phase 10</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />

            {/* Employee routes */}
            <Route
              path="/employee/dashboard"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <EmployeeDashboard />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/employee/profile"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Profile â€” coming in Phase 6</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/employee/attendance"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <EmployeeAttendance />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/employee/wfh"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <EmployeeWFH />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            {/* Employee leave routes */}
            <Route
              path="/employee/leaves"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <EmployeeLeaveRequests />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/employee/leaves/balances"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <EmployeeLeaveBalances />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/employee/leaves/apply"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <EmployeeApplyLeave />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/employee/comp-offs"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Comp-Off â€” coming in Phase 8</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/employee/payslips"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <EmployeePayslipsPage />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/employee/notifications"
              element={
                <RoleRoute allowedRoles={['EMPLOYEE']}>
                  <ProtectedRoute>
                    <div className="min-h-screen flex items-center justify-center">
                      <p className="text-slate-500">Notifications â€” coming in Phase 10</p>
                    </div>
                  </ProtectedRoute>
                </RoleRoute>
              }
            />

            {/* Shared */}
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
