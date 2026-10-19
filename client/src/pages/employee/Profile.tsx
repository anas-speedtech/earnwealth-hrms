import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';

export default function EmployeeProfilePage() {
  const { user, logout } = useAuth();

  const fullName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : (user?.email || 'Employee');

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={fullName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Profile" subtitle="Your account details" />
      <div className="p-8 max-w-3xl">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Full name</dt>
              <dd className="font-medium text-slate-800">{fullName}</dd>
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
              <dt className="text-slate-500">Member since</dt>
              <dd className="font-medium text-slate-800">
                {String(user?.profile?.memberSince ?? '—')}
              </dd>
            </div>
          </dl>
          <p className="mt-6 text-xs text-slate-400">
            Personal details such as address or phone number are managed by your HR department.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
