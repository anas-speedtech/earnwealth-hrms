import { Link, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  IdCard,
  LayoutDashboard,
  Settings2,
  User,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  role: string;
  userName: string;
  userEmail: string;
}

type IconName = 'dashboard' | 'users' | 'role' | 'calendar' | 'controls' | 'profile' | 'attendance';

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  // When set, the item expands to reveal sub-menu entries (e.g. Role & Designation).
  submenu?: { label: string; href: string }[];
}

const navIcons: Record<IconName, React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number | string }>> = {
  dashboard: LayoutDashboard,
  users: Users,
  role: IdCard,
  calendar: CalendarDays,
  controls: Settings2,
  profile: User,
  attendance: Clock,
};

// The "Role & Designation" section: the Role sub-menu opens the Role &
// Designation screen on its Role tab, the Designation sub-menu deep-links to
// its Designation tab.
const ROLE_AND_DESIGNATION_SUBMENU = [
  { label: 'Role', href: '/super-admin/user-roles' },
  { label: 'Designation', href: '/super-admin/user-roles?tab=designation' },
];

// The "Leaves" section gives HR a broad view: an Overview (tile) screen plus
// the approvals screen, and a Leave Policy config screen for setting the
// organisation-wide annual entitlements.
const LEAVES_SUBMENU = [
  { label: 'Overview', href: '/hr/leaves' },
  { label: 'Approvals', href: '/hr/leaves?tab=requests' },
  { label: 'Leave Policy', href: '/super-admin/leave-config' },
];

// The "Users" section: the Accounts screen manages login accounts, and
// "Employee Details" opens the searchable employee directory where records
// can be viewed and edited (HR Admin and Super Admin both have edit rights).
const USERS_SUBMENU = [
  { label: 'Accounts', href: '/super-admin/admins' },
  { label: 'Employee Details', href: '/admin/employees' },
];

// Side-menu structure per role. Labels avoid the word "management" as
// requested; the Role & Designation section carries a submenu.
const roleNavigation: Record<string, NavItem[]> = {
  SUPER_ADMIN: [
    { label: 'Dashboard', href: '/super-admin/dashboard', icon: 'dashboard' },
    { label: 'Users', href: '/super-admin/admins', icon: 'users', submenu: USERS_SUBMENU },
    {
      label: 'Roles & Designations',
      href: '/super-admin/user-roles',
      icon: 'role',
      submenu: ROLE_AND_DESIGNATION_SUBMENU,
    },
    { label: 'Attendance', href: '/hr/attendance', icon: 'attendance' },
    {
      label: 'Leaves',
      href: '/hr/leaves',
      icon: 'calendar',
      submenu: LEAVES_SUBMENU,
    },
    { label: 'Controls', href: '/super-admin/controls', icon: 'controls' },
  ],
  HR_ADMIN: [
    { label: 'Dashboard', href: '/hr/dashboard', icon: 'dashboard' },
    { label: 'Users', href: '/super-admin/admins', icon: 'users', submenu: USERS_SUBMENU },
    {
      label: 'Roles & Designations',
      href: '/super-admin/user-roles',
      icon: 'role',
      submenu: ROLE_AND_DESIGNATION_SUBMENU,
    },
    { label: 'Attendance', href: '/hr/attendance', icon: 'attendance' },
    {
      label: 'Leaves',
      href: '/hr/leaves',
      icon: 'calendar',
      submenu: LEAVES_SUBMENU,
    },
    { label: 'Controls', href: '/super-admin/controls', icon: 'controls' },
    // An HR Admin is also an employee, so they can view their own details.
    { label: 'My Profile', href: '/employee/profile', icon: 'profile' },
  ],
  EMPLOYEE: [
    { label: 'Dashboard', href: '/employee/dashboard', icon: 'dashboard' },
    { label: 'Calendar', href: '/super-admin/holidays', icon: 'calendar' },
  ],
};

export default function Sidebar({ role, userName, userEmail }: SidebarProps) {
  const location = useLocation();
  const { avatarUrl } = useAuth();
  const navItems = roleNavigation[role] || [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const pathKey = (href: string) => {
    // Sub-menu items that share a base path (Role & Designation, Leaves)
    // count as one active section — strip the query string.
    return href.split('?')[0];
  };

  const initials = userName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="flex w-[256px] shrink-0 flex-col border-r border-slate-200/70 bg-white">
      {/* Logo */}
      <div className="px-5 pb-4 pt-5">
        <img
          src="/earnwealth-logo-banner.png"
          alt="EarnWealth — Kamate Raho"
          className="h-14 w-full rounded-lg object-contain shadow-sm ring-1 ring-slate-200/80"
        />
        <p className="mt-2 text-center text-[11px] font-medium text-slate-400">HRMS · People Ops</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Menu
        </p>
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = navIcons[item.icon];
            const activeKey = pathKey(item.href);
            const isSectionActive = item.submenu
              ? item.submenu.some((s) => s.href.split('?')[0] === activeKey)
              : location.pathname === activeKey;
            const isOpen = expanded[activeKey] !== false; // open by default

            return (
              <div key={item.href}>
                <div className="relative">
                  {isSectionActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-full bg-cyan-600" />
                  )}
                  {item.submenu ? (
                    <div className="group flex items-center">
                      <Link
                        to={item.href}
                        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                          isSectionActive
                            ? 'bg-cyan-50 text-cyan-700'
                            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                        }`}
                      >
                        <Icon size={16} strokeWidth={2} className={isSectionActive ? 'text-cyan-600' : 'text-slate-400 group-hover:text-slate-600'} />
                        <span className="truncate flex-1">{item.label}</span>
                      </Link>
                      <button
                        aria-label={isOpen ? 'Collapse' : 'Expand'}
                        onClick={() => setExpanded((prev) => ({ ...prev, [activeKey]: !isOpen }))}
                        className="mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>
                  ) : (
                    <Link
                      to={item.href}
                      className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                        isSectionActive
                          ? 'bg-cyan-50 text-cyan-700'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                      }`}
                    >
                      <Icon size={16} strokeWidth={2} className={isSectionActive ? 'text-cyan-600' : 'text-slate-400'} />
                      <span className="truncate flex-1">{item.label}</span>
                    </Link>
                  )}
                </div>

                {item.submenu && isOpen && (
                  <div className="ml-[19px] mt-0.5 space-y-0.5 border-l border-slate-200/80 pl-3">
                    {item.submenu.map((sub) => {
                      const subBase = sub.href.split('?')[0];
                      const subQuery = sub.href.includes('?') ? sub.href.split('?')[1] : '';
                      // A sub-item is active when the current path matches its
                      // base and, if it carries a query, the current search
                      // string carries the same query (otherwise the query-less
                      // item of the same section is the active one).
                      const subActive =
                        location.pathname === subBase &&
                        (subQuery
                          ? location.search.includes(subQuery)
                          : !location.search || location.search.split('?').every((seg) => seg.split('=')[0] !== 'tab'));
                      return (
                        <Link
                          key={sub.href}
                          to={sub.href}
                          className={`block rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                            subActive
                              ? 'text-cyan-700'
                              : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                          }`}
                        >
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Account footer */}
      <div className="border-t border-slate-200/80 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
            />
          ) : (
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
              {initials || 'U'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-slate-900">{userName}</p>
            <p className="truncate text-[11px] text-slate-400">{userEmail}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
