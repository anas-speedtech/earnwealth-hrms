import Sidebar from './Sidebar';
import { ReactNode } from 'react';
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

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      <Sidebar role={effectiveRole} userName={userName} userEmail={userEmail} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
