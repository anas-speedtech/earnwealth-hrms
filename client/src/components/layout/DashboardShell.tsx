import Sidebar from './Sidebar';
import { ReactNode } from 'react';

interface DashboardShellProps {
  role: string;
  userName: string;
  userEmail: string;
  onLogout: () => void;
  children: ReactNode;
}

export default function DashboardShell({ role, userName, userEmail, onLogout, children }: DashboardShellProps) {
  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        role={role}
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
