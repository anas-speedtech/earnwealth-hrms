import { ReactNode, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Settings, UserRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * Compact top bar: breadcrumb-style page title on the left, session controls
 * (notifications + profile menu) on the right.
 */
export default function Header({ title, subtitle, actions }: HeaderProps) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : user?.email || 'Account';

  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <h1 className="truncate text-[15px] font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="hidden truncate text-[12px] text-slate-400 md:block">{subtitle}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          aria-label="Notifications"
          className="relative grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Bell size={15} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-500 ring-2 ring-white" />
        </button>

        {/* Profile + session menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-0.5 pl-1 pr-2.5 shadow-sm transition hover:border-slate-300"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
              {initials || 'U'}
            </span>
            <span className="hidden max-w-[8rem] truncate text-[13px] font-medium text-slate-700 sm:block">
              {displayName}
            </span>
            <ChevronDown size={13} className="text-slate-400" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1.5 w-52 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.16)]">
              <div className="border-b border-slate-100 px-3.5 py-2.5">
                <p className="truncate text-[13px] font-semibold text-slate-900">{displayName}</p>
                <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
              </div>
              <div className="py-1">
                <Link
                  to="/employee/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-slate-600 transition hover:bg-slate-50"
                >
                  <UserRound size={15} className="text-slate-400" /> Profile
                </Link>
                <Link
                  to="/super-admin/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] text-slate-600 transition hover:bg-slate-50"
                >
                  <Settings size={15} className="text-slate-400" /> Settings
                </Link>
              </div>
              <div className="border-t border-slate-100 py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-50/60"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>

        {actions && <div className="ml-1 flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
