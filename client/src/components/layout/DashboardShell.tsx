import Sidebar from './Sidebar';
import { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface DashboardShellProps {
  role?: string;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  children: ReactNode;
}

export default function DashboardShell({ role, userName, userEmail, onLogout, children }: DashboardShellProps) {
  const { user } = useAuth();
  const effectiveRole = user?.role || role || 'EMPLOYEE';

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        role={effectiveRole}
        userName={userName}
        userEmail={userEmail}
        onLogout={onLogout}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}