import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';

const CARD =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';

export default function SuperAdminSettingsPage() {
  const { user, logout } = useAuth();

  const displayName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : user?.email || 'Super Admin';

  return (
    <DashboardShell
      role="SUPER_ADMIN"
      userName={displayName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Settings" subtitle="Account and session information" />
      <div className="p-6 max-w-3xl">
        <div className={`p-5 sm:p-6 ${CARD}`}>
          <h3 className="mb-4 text-[15px] font-bold tracking-tight text-slate-900">Signed in account</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Name</dt>
              <dd className="font-semibold text-slate-900">{displayName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Email</dt>
              <dd className="font-semibold text-slate-900">{user?.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Role</dt>
              <dd className="font-semibold text-slate-900">{user?.role}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Account ID</dt>
              <dd className="font-semibold text-slate-900">{user?.id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Session</dt>
              <dd className="font-semibold text-slate-900">Active</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-400">
            Sign Out is available from the profile menu in the top-right corner of the header.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
