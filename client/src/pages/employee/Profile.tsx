import { User, Mail, ShieldCheck, KeyRound, CalendarDays } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';

export default function EmployeeProfilePage() {
  const { user, logout } = useAuth();

  const fullName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : (user?.email || 'Employee');

  const rows = [
    { icon: User, label: 'Full name', value: fullName },
    { icon: Mail, label: 'Email', value: user?.email },
    { icon: ShieldCheck, label: 'Role', value: user?.role?.replace('_', ' ') },
    { icon: KeyRound, label: 'Account ID', value: user?.id },
    { icon: CalendarDays, label: 'Member since', value: String(user?.profile?.memberSince ?? '—') },
  ];

  return (
    <DashboardShell role="EMPLOYEE" userName={fullName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Profile" subtitle="Your account details" />
      <div className="p-6 max-w-3xl">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
          <dl className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2.5 text-[13px] font-medium text-slate-500">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-400">
                    <row.icon size={13} />
                  </span>
                  {row.label}
                </dt>
                <dd className="text-[13px] font-medium text-slate-900">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 border-t border-slate-100 pt-4 text-xs text-slate-400">
            Personal details such as address or phone number are managed by your HR department.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
