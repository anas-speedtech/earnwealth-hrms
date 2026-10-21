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

// Side-menu structure per role. Labels avoid the word "management" as
// requested; the Role & Designation section carries a submenu.
const roleNavigation: Record<string, NavItem[]> = {
  SUPER_ADMIN: [
    { label: 'Dashboard', href: '/super-admin/dashboard', icon: 'dashboard' },
    { label: 'User', href: '/super-admin/admins', icon: 'users' },
    {
      label: 'Role & Designation',
      href: '/super-admin/user-roles',
      icon: 'role',
      submenu: ROLE_AND_DESIGNATION_SUBMENU,
    },
    { label: 'Attendance', href: '/hr/attendance', icon: 'attendance' },
    { label: 'Calendar', href: '/super-admin/holidays', icon: 'calendar' },
    { label: 'Controls', href: '/super-admin/controls', icon: 'controls' },
  ],
  HR_ADMIN: [
    { label: 'Dashboard', href: '/hr/dashboard', icon: 'dashboard' },
    { label: 'User', href: '/super-admin/admins', icon: 'users' },
    {
      label: 'Role & Designation',
      href: '/super-admin/user-roles',
      icon: 'role',
      submenu: ROLE_AND_DESIGNATION_SUBMENU,
    },
    { label: 'Attendance', href: '/hr/attendance', icon: 'attendance' },
    { label: 'Calendar', href: '/super-admin/holidays', icon: 'calendar' },
    { label: 'Controls', href: '/super-admin/controls', icon: 'controls' },
    // An HR Admin is also an employee, so they can view their own details.
    { label: 'My Profile', href: '/employee/profile', icon: 'profile' },
  ],
  EMPLOYEE: [
    { label: 'Dashboard', href: '/employee/dashboard', icon: 'dashboard' },
    { label: 'My Profile', href: '/employee/profile', icon: 'profile' },
    { label: 'Calendar', href: '/super-admin/holidays', icon: 'calendar' },
  ],
};

export default function Sidebar({ role, userName, userEmail }: SidebarProps) {
  const location = useLocation();
  const navItems = roleNavigation[role] || [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const pathKey = (href: string) => {
    // Treat the two Role & Designation sub-menu links as one active section.
    if (href.startsWith('/super-admin/user-roles')) return '/super-admin/user-roles';
    return href;
  };

  return (
    <aside className="flex w-[16.5rem] shrink-0 flex-col bg-[#10162b] text-white">
      {/* Logo */}
      <div className="px-6 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <img
            src="/ews-logo.png"
            alt="EarnWealth"
            className="h-11 w-11 rounded-xl bg-white object-contain shadow-md shadow-black/20"
          />
          <div>
            <h1 className="text-[15px] font-bold tracking-tight">EWS HRMS</h1>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              People operations
            </p>
          </div>
        </div>
      </div>

      {/* Navigation — flat, one accent colour, active item uses a left rail
          indicator. Items with a submenu expand in place. */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navItems.map((item) => {
          const Icon = navIcons[item.icon];
          const activeKey = pathKey(item.href);
          const isSectionActive = item.submenu
            ? item.submenu.some((s) => pathKey(s.href) === activeKey || location.pathname === s.href)
            : location.pathname === activeKey;
          const isOpen = expanded[activeKey] !== false; // open by default

          return (
            <div key={item.href}>
              <div
                className={`group relative mb-0.5 flex items-center rounded-lg transition-all ${
                  isSectionActive ? 'bg-primary-500/15' : 'hover:bg-white/[0.06]'
                }`}
              >
                {isSectionActive && (
                  <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-primary-400" />
                )}
                {item.submenu ? (
                  <>
                    <Link
                      to={item.href}
                      className={`flex flex-1 items-center gap-3 px-3 py-2.5 text-sm font-medium ${
                        isSectionActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                      }`}
                    >
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-lg ${
                          isSectionActive
                            ? 'bg-primary-500/25 text-primary-300'
                            : 'text-slate-500 group-hover:text-slate-300'
                        }`}
                      >
                        <Icon size={17} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                    </Link>
                    <button
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                      onClick={() => setExpanded((prev) => ({ ...prev, [activeKey]: !isOpen }))}
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.07] hover:text-white"
                    >
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  </>
                ) : (
                  <Link
                    to={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium ${
                      isSectionActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                    }`}
                  >
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-lg ${
                        isSectionActive
                          ? 'bg-primary-500/25 text-primary-300'
                          : 'text-slate-500 group-hover:text-slate-300'
                      }`}
                    >
                      <Icon size={17} />
                    </span>
                    <span className="flex-1">{item.label}</span>
                  </Link>
                )}
              </div>

              {item.submenu && isOpen && (
                <div className="ml-5 mt-0.5 mb-1 space-y-0.5 border-l border-white/[0.07] pl-3">
                  {item.submenu.map((sub) => {
                    const subActive = location.pathname === sub.href.split('?')[0] && (sub.href.includes('?tab=')
                      ? window.location.search.includes(sub.href.split('?')[1])
                      : !location.search.includes('tab='));
                    return (
                      <Link
                        key={sub.href}
                        to={sub.href}
                        className={`block rounded-md px-3 py-1.5 text-sm transition ${
                          subActive ? 'text-primary-300' : 'text-slate-400 hover:text-white'
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
      </nav>

      {/* Account footer */}
      <div className="border-t border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-sm font-semibold text-white shadow">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="truncate text-xs text-slate-400">{userEmail}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
