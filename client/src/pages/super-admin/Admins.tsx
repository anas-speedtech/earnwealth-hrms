import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import toast from 'react-hot-toast';

interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface NewAccount {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'HR_ADMIN' | 'EMPLOYEE';
}

const ROLE_OPTIONS: { value: NewAccount['role']; label: string }[] = [
  { value: 'HR_ADMIN', label: 'HR Admin' },
  { value: 'EMPLOYEE', label: 'Employee' },
];

const ROLE_LABELS: Record<string, string> = {
  HR_ADMIN: 'HR Admin',
  EMPLOYEE: 'Employee',
};

export default function SuperAdminAdminsPage() {
  const { user, logout } = useAuth();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [form, setForm] = useState<NewAccount>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'HR_ADMIN',
  });

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchAccounts();
      setAccounts(response);
    } catch {
      setError('Failed to load accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAccounts = async (): Promise<AdminAccount[]> => {
    const { data } = await api.get<AdminAccount[]>(`/admin-users?role=HR_ADMIN,EMPLOYEE`);
    return data;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setFieldError('Full name and email are required.');
      return;
    }
    if (!form.email.includes('@')) {
      setFieldError('Please enter a valid email address.');
      return;
    }
    // Password is required for HR Admin accounts but optional for Employee accounts
    if (form.role === 'HR_ADMIN' && (!form.password || form.password.length < 8)) {
      setFieldError('Password must be at least 8 characters for HR Admin accounts.');
      return;
    }
    setIsSubmitting(true);
    setFieldError(null);
    try {
      await api.post('/admin-users', {
        name: form.name,
        email: form.email,
        password: form.password || '',
        role: form.role,
      });
      toast.success(`Account created for ${form.email}.`);
      setShowForm(false);
      setForm({ name: '', email: '', password: '', confirmPassword: '', role: 'HR_ADMIN' });
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ||
        'Could not create the account. The email may already be in use.';
      setFieldError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (account: AdminAccount) => {
    try {
      const { data } = await api.patch(`/admin-users/${account.id}/status`, {
        isActive: !account.isActive,
      });
      toast.success(data.message || 'Account updated.');
      load();
    } catch {
      toast.error('Could not update the account.');
    }
  };

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  return (
    <DashboardShell role="SUPER_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="HR Admin" subtitle="Provision and manage HR Admin and Employee accounts" />
      <div className="p-8 max-w-6xl">
        {canManage && (
          <div className="mb-4">
            <button
              onClick={() => {
                setShowForm(!showForm);
                setFieldError(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              {showForm ? 'Close' : '+ New Account'}
            </button>
          </div>
        )}

        {showForm && canManage && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">New Account</h3>
            {fieldError && <p className="mb-3 text-sm text-red-600">{fieldError}</p>}
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
                    placeholder="admin@company.com"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {form.role === 'HR_ADMIN' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                      <input
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="At least 8 characters"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                      <input
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        type="password"
                        value={form.confirmPassword}
                        onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                        placeholder="Re-enter password"
                        required
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as NewAccount['role'] })}
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Creating…' : 'Create Account'}
              </button>
            </form>
          </div>
        )}

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {isLoading ? (
          <p className="text-slate-500">Loading accounts…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-500">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Email</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Role</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-700">{account.name}</td>
                    <td className="px-4 py-3 text-slate-600">{account.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {ROLE_LABELS[account.role] || account.role}
                      </span>
                    </td>
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
                    <td className="px-4 py-3">
                      {account.isActive && (
                        <button
                          onClick={() => handleToggle(account)}
                          className="px-3 py-1 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
