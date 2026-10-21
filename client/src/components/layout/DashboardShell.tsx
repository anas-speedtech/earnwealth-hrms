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
    <div className="flex h-screen overflow-hidden bg-[#f6f8fc]">
      <Sidebar role={effectiveRole} userName={userName} userEmail={userEmail} />
      <main className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_100%_0%,rgba(14,165,233,0.10),transparent_25rem)]">
        {children}
      </main>
    </div>
  );
}
