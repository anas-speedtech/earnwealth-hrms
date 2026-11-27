import Sidebar from './Sidebar';
import { MobileNavProvider } from './MobileNavContext';
import { ReactNode, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface DashboardShellProps {
  role?: string;
  userName: string;
  userEmail: string;
  // Kept for backward compatibility with page callers; the sign-out control
  // now lives in the Header, so this prop is no longer used by the layout.
  onLogout?: () => void;
  children: ReactNode;
}

export default function DashboardShell({ role, userName, userEmail, children }: DashboardShellProps) {
  const { user } = useAuth();
  const effectiveRole = user?.role || role || 'EMPLOYEE';
  // Mobile (<lg): the sidebar becomes an off-canvas drawer, toggled by the
  // hamburger on each page's Header (the page components render their own
  // Header, so the drawer state is bridged through MobileNavContext).
  // Desktop keeps the fixed 256px column.
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);

  return (
    <MobileNavProvider value={{ open: navOpen, toggle: () => setNavOpen((open) => !open) }}>
      <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <Sidebar role={effectiveRole} userName={userName} userEmail={userEmail} />
        </div>

        {/* Mobile drawer */}
        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40"
              onClick={closeNav}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 z-50 shadow-2xl">
              <Sidebar role={effectiveRole} userName={userName} userEmail={userEmail} onNavigate={closeNav} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
