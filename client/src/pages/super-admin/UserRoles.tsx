import { useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface AccountSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface RoleGroup {
  role: string;
  label: string;
  accounts: AccountSummary[];
}

interface NewAccount {
  name: string;
  email: string;
  role: string;
}

const ALL_ROLE_GROUPS: { role: string; label: string }[] = [
  { role: 'SUPER_ADMIN', label: 'Super Admin' },
  { role: 'HR_ADMIN', label: 'HR Admin' },
  { role: 'EMPLOYEE', label: 'Employee' },
];

export default function SuperAdminUserRolesPage() {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState<RoleGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<NewAccount>({
    name: '',
    email: '',
    role: 'EMPLOYEE',
  });

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const requests = ALL_ROLE_GROUPS.map(async (group) => {
        const { data } = await api.get<AccountSummary[]>(
          `/admin-users?role=${group.role}`,
        );
        return { ...group, accounts: data };
      });
      const results = await Promise.all(requests);
      setGroups(results);
    } catch {
      setError('Failed to load the user roles.');
    } finally {
      setIsLoading(false);
    }
  };
  load();

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Full name and email are required.');
      return;
    }
    if (!form.email.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post('/admin-users', {
        name: form.name,
        email: form.email,
        role: form.role,
      });
      toast.success(`Account created for ${form.email}.`);
      setForm({ name: '', email: '', role: 'EMPLOYEE' });
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ||
        'Could not create the account. The email may already be in use.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardShell
      role="SUPER_ADMIN"
      userName={displayName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="User Role Management" subtitle="Accounts grouped by their system role" />
      <div className="p-8 max-w-6xl">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {/* Create Account Form */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Create New Account</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Asha Rao"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="emp-1001@earnwealth.com"
                  required
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="HR_ADMIN">HR Admin</option>
                  <option value="EMPLOYEE">Employee</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Account Listings */}
        {isLoading ? (
          <p className="text-slate-500">Loading user roles…</p>
        ) : groups.every((g) => g.accounts.length === 0) ? (
          <p className="text-slate-500">No accounts found.</p>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group.role}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-700">{group.label}</h3>
                  <span className="text-sm text-slate-500">{group.accounts.length} accounts</span>
                </div>
                {group.accounts.length === 0 ? (
                  <p className="text-sm text-slate-400">No accounts in this group.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Name</th>
                          <th className="px-4 py-3 font-medium">Email</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.accounts.map((account) => (
                          <tr key={account.id} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-medium text-slate-700">{account.name}</td>
                            <td className="px-4 py-3 text-slate-600">{account.email}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  account.isActive
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {account.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{account.createdAt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}