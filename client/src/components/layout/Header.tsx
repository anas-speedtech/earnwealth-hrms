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
 * Top bar. The top-right corner now owns the profile + session controls that
 * were in the sidebar footer (Sign Out) and the Settings page — the sidebar no
 * longer surfaces either.
 */
export default function Header({ title, subtitle, actions }: HeaderProps) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : user?.email || 'Account';

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
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 px-5 py-4 backdrop-blur-xl sm:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            aria-label="Notifications"
            className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <Bell size={18} />
            <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-primary-500 ring-2 ring-white" />
          </button>

          {/* Profile + session menu, top-right corner */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-xs font-semibold text-white">
                {displayName.charAt(0).toUpperCase()}
              </span>
              <span className="hidden max-w-[9rem] truncate text-sm font-medium text-slate-700 sm:block">
                {displayName}
              </span>
              <ChevronDown size={15} className="text-slate-400" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/10">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                  <p className="truncate text-xs text-slate-500">{user?.email}</p>
                </div>
                <div className="py-1">
                  <Link
                    to="/employee/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                  >
                    <UserRound size={16} className="text-slate-400" /> Profile
                  </Link>
                  <Link
                    to="/super-admin/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                  >
                    <Settings size={16} className="text-slate-400" /> Settings
                  </Link>
                </div>
                <div className="border-t border-slate-100 py-1">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 transition hover:bg-red-50"
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>

          {actions && <div className="ml-1 flex items-center gap-3">{actions}</div>}
        </div>
      </div>
    </header>
  );
}
