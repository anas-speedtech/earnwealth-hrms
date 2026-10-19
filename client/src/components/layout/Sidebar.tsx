import { Link, useLocation } from 'react-router-dom';
import { RoleLabels } from '../../utils/constants';

interface SidebarProps {
  role: string;
  userName: string;
  userEmail: string;
  onLogout: () => void;
}

const roleNavigation: Record<string, { label: string; href: string }[]> = {
  // Super Admin: every module, plus the system-level administration tabs.
  SUPER_ADMIN: [
    { label: 'Dashboard', href: '/super-admin/dashboard' },
    { label: 'Payroll Approval', href: '/super-admin/payroll-approval' },
    { label: 'HR Admin', href: '/super-admin/admins' },
    { label: 'Settings', href: '/super-admin/settings' },
    { label: 'Policies', href: '/super-admin/policies' },
    { label: 'Holidays', href: '/super-admin/holidays' },
    { label: 'Attendance', href: '/super-admin/attendance' },
    { label: 'Audit Logs', href: '/super-admin/audit-logs' },
    { label: 'Reports', href: '/super-admin/reports' },
    { label: 'Leaves', href: '/super-admin/leaves' },
    { label: 'User Role', href: '/super-admin/user-roles' },
  ],
  // HR Admin: same modules as Super Admin minus User Role and HR Staff.
  // Uses /hr/* routes where available, /super-admin/* routes where no /hr/* equivalent exists.
  HR_ADMIN: [
    { label: 'Dashboard', href: '/hr/dashboard' },
    { label: 'Payroll Approval', href: '/hr/payroll' },
    { label: 'HR Admin', href: '/super-admin/admins' },
    { label: 'Settings', href: '/super-admin/settings' },
    { label: 'Policies', href: '/super-admin/policies' },
    { label: 'Holidays', href: '/super-admin/holidays' },
    { label: 'Attendance', href: '/hr/attendance' },
    { label: 'Audit Logs', href: '/super-admin/audit-logs' },
    { label: 'Reports', href: '/hr/reports' },
    { label: 'Leaves', href: '/hr/leaves' },
  ],
  EMPLOYEE: [
    { label: 'Dashboard', href: '/employee/dashboard' },
    { label: 'Profile', href: '/employee/profile' },
    { label: 'Settings', href: '/super-admin/settings' },
    { label: 'Policies', href: '/super-admin/policies' },
    { label: 'Holidays', href: '/super-admin/holidays' },
    { label: 'Attendance', href: '/employee/attendance' },
    { label: 'Leaves', href: '/employee/leaves' },
    { label: 'Payslips', href: '/employee/payslips' },
    { label: 'Notifications', href: '/employee/notifications' },
  ],
};

const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-600',
  HR_ADMIN: 'bg-green-600',
  EMPLOYEE: 'bg-slate-600',
};

export default function Sidebar({ role, userName, userEmail, onLogout }: SidebarProps) {
  const location = useLocation();
  const navItems = roleNavigation[role] || [];

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">E</span>
          </div>
          <div>
            <h1 className="text-lg font-bold">EWS HRMS</h1>
          </div>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-6 py-3 border-b border-slate-800">
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[role] || 'bg-slate-600'} text-white`}>
          {RoleLabels[role as keyof typeof RoleLabels] || role.replace('_', ' ')}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium">{userName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-slate-400 truncate">{userEmail}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
