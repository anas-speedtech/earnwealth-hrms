import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import RoleRoute from './components/layout/RoleRoute';

// Auth pages
import CommonLogin from './pages/auth/CommonLogin';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import VerifyOtp from './pages/auth/VerifyOtp';

// Dashboard pages
import SuperAdminDashboard from './pages/super-admin/Dashboard';
import SuperAdminPayrollApproval from './pages/super-admin/PayrollApproval';
import AuditLogs from './pages/super-admin/AuditLogs';
import AdminDashboard from './pages/admin/Dashboard';
import HrDashboard from './pages/hr/Dashboard';
import HrAttendance from './pages/hr/Attendance';
import HrWFH from './pages/hr/WFH';
import HRPayroll from './pages/hr/HRPayroll';
import EmployeeDashboard from './pages/employee/Dashboard';
import EmployeeAttendance from './pages/employee/Attendance';
import EmployeeWFH from './pages/employee/WFH';
import EmployeeLeaveBalances from './pages/employee/LeaveBalances';
import EmployeeApplyLeave from './pages/employee/ApplyLeave';
import EmployeeLeaves from './pages/employee/Leaves';
import EmployeePayslipsPage from './pages/employee/Payslips';

// Super Admin pages
import SuperAdminAdmins from './pages/super-admin/Admins';
import SuperAdminSettings from './pages/super-admin/Settings';
import SuperAdminPolicies from './pages/super-admin/Policies';
import SuperAdminHolidays from './pages/super-admin/Holidays';
import SuperAdminReports from './pages/super-admin/Reports';
import SuperAdminAttendance from './pages/super-admin/Attendance';
import SuperAdminLeaves from './pages/super-admin/Leaves';
import RoleDesignation from './pages/super-admin/RoleDesignation';
import Controls from './pages/super-admin/Controls';

// Admin pages
import EmployeeList from './pages/admin/EmployeeList';
import EmployeeCreate from './pages/admin/EmployeeCreate';
import EmployeeDetail from './pages/admin/EmployeeDetail';
import DepartmentList from './pages/admin/DepartmentList';
import DesignationList from './pages/admin/DesignationList';
import AdminAttendanceReview from './pages/admin/AttendanceReview';
import AdminReports from './pages/admin/Reports';

// HR pages
import HrCompOffs from './pages/hr/CompOffs';
import HrLeaves from './pages/hr/Leaves';
import HrPayslips from './pages/hr/Payslips';
import HrReports from './pages/hr/Reports';

// Employee pages
import EmployeeProfile from './pages/employee/Profile';
import EmployeeCompOffs from './pages/employee/CompOffs';
import EmployeeNotifications from './pages/employee/Notifications';

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
    HR_ADMIN: '/hr/dashboard',
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
            {/* Root — redirects to role dashboard or shows login options */}
            <Route path="/" element={<HomeRedirect />} />

            {/* Login pages */}
            <Route path="/login" element={<CommonLogin />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/verify-otp" element={<VerifyOtp />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/super-admin/login" element={<Navigate to="/login" replace />} />
            <Route path="/admin/login" element={<Navigate to="/login" replace />} />
            <Route path="/hr/login" element={<Navigate to="/login" replace />} />
            <Route path="/employee/login" element={<Navigate to="/login" replace />} />

            {/* Super Admin routes — Super Admin has access to every option. */}
            <Route
              path="/super-admin/dashboard"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <SuperAdminDashboard />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/admins"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <SuperAdminAdmins />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/settings"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE']}>
                  <ProtectedRoute>
                    <SuperAdminSettings />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/policies"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE']}>
                  <ProtectedRoute>
                    <SuperAdminPolicies />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/holidays"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN', 'EMPLOYEE']}>
                  <ProtectedRoute>
                    <SuperAdminHolidays />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/attendance"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <SuperAdminAttendance />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/audit-logs"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                  <ProtectedRoute>
                    <AuditLogs />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/payroll-approval"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <SuperAdminPayrollApproval />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/reports"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <SuperAdminReports />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/leaves"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <SuperAdminLeaves />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/user-roles"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <RoleDesignation />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/super-admin/controls"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <Controls />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />

            {/* Admin routes — Super Admin also has full access here. */}
            <Route
              path="/admin/dashboard"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <AdminDashboard />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/employees"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <EmployeeList />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/employees/new"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <EmployeeCreate />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/employees/:id"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <EmployeeDetail />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/departments"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <DepartmentList />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/designations"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <DesignationList />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/attendance"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <AdminAttendanceReview />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <AdminReports />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />

            {/* HR routes — Super Admin also has full access here. */}
            <Route
              path="/hr/dashboard"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <HrDashboard />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/attendance"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <HrAttendance />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/wfh"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <HrWFH />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/leaves"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <HrLeaves />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/comp-offs"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <HrCompOffs />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/payroll"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <HRPayroll />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/payslips"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <HrPayslips />
                  </ProtectedRoute>
                </RoleRoute>
              }
            />
            <Route
              path="/hr/reports"
              element={
                <RoleRoute allowedRoles={['SUPER_ADMIN', 'HR_ADMIN']}>
                  <ProtectedRoute>
                    <HrReports />
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
                    <EmployeeProfile />
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
                    <EmployeeLeaves />
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
                    <EmployeeCompOffs />
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
                    <EmployeeNotifications />
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
