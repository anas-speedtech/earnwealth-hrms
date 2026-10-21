import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';

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
      <div className="p-8 max-w-3xl">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Signed in account</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium text-slate-800">{displayName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-800">{user?.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Role</dt>
              <dd className="font-medium text-slate-800">{user?.role}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Account ID</dt>
              <dd className="font-medium text-slate-800">{user?.id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Session</dt>
              <dd className="font-medium text-slate-800">Active</dd>
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
