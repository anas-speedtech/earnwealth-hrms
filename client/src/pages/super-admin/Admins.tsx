import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { organizationService, Designation } from '../../services/organization.service';
import toast from 'react-hot-toast';

interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  employeeCode: string | null;
  reportingManager: string | null;
  designation: string | null;
}

interface NewAccount {
  name: string;
  email: string;
  password: string;
  employeeCode: string;
  designation: string;
  reportingManager: string;
  role: 'HR_ADMIN' | 'EMPLOYEE';
}

const ROLE_OPTIONS: { value: NewAccount['role']; label: string }[] = [
  { value: 'HR_ADMIN', label: 'HR Admin' },
  { value: 'EMPLOYEE', label: 'Employee' },
];

// Super Admin appoints only HR Admins; HR Admin appoints only Employees.
// This mirrors the server-side guard in UserManagementService.create().
function getRoleOptions(userRole: string): { value: NewAccount['role']; label: string }[] {
  if (userRole === 'SUPER_ADMIN') return ROLE_OPTIONS.filter((o) => o.value === 'HR_ADMIN');
  return ROLE_OPTIONS.filter((o) => o.value === 'EMPLOYEE');
}

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
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; employeeCode: string }[]>([]);
  const [form, setForm] = useState<NewAccount>({
    name: '',
    email: '',
    password: '',
    employeeCode: '',
    designation: '',
    reportingManager: '',
    role: 'HR_ADMIN',
  });

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';
  const roleOptions = getRoleOptions(user?.role || '');

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

  // Load the designation list and the employee list (for the reporting-manager
  // picker) so the create form can reference both.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setDesignations(await organizationService.getDesignations());
      } catch {
        // non-critical
      }
      try {
        const page = await organizationService.getEmployees({ page: 1 });
        if (mounted) {
          setEmployees(
            (page.data || []).map((e: { id: string; firstName?: string; lastName?: string; name?: string; employeeCode?: string }) => ({
              id: e.id,
              name: (e.firstName && e.lastName) ? `${e.firstName} ${e.lastName}` : (e.name || 'Unknown'),
              employeeCode: e.employeeCode || '',
            })),
          );
        }
      } catch {
        // non-critical
      }
    })();
    return () => { mounted = false; };
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
    // The employee code is entered manually and is required for every account
    // created here (HR Admin and Employee). The server enforces uniqueness
    // and treats it as immutable.
    if (!form.employeeCode.trim()) {
      setFieldError('Employee code is required. Enter the code manually — it is not auto-generated.');
      return;
    }
    // Every Employee must map to a higher person.
    if (form.role === 'EMPLOYEE' && !form.reportingManager) {
      setFieldError('A reporting manager is required for Employee accounts.');
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
        employeeCode: form.employeeCode || '',
        designation: form.designation || '',
        reportingManager: form.reportingManager || '',
      });
      toast.success(`Account created for ${form.email}.`);
      setShowForm(false);
      setForm({ name: '', email: '', password: '', employeeCode: '', designation: '', reportingManager: '', role: 'HR_ADMIN' });
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
    if (togglingId) return; // Prevent repeated requests
    setTogglingId(account.id);
    try {
      const { data } = await api.patch(`/admin-users/${account.id}/status`, {
        isActive: !account.isActive,
      });
      toast.success(data.message || `Account ${!account.isActive ? 'activated' : 'deactivated'}.`);
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not update the account.';
      toast.error(message);
    } finally {
      setTogglingId(null);
    }
  };

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  return (
    <DashboardShell role={user?.role || 'SUPER_ADMIN'} userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="User Management" subtitle="Provision and manage user accounts" />
      <div className="p-8 max-w-6xl">
        {canManage && (
          <div className="mb-4">
            <button
              onClick={() => {
                setShowForm(!showForm);
                setFieldError(null);
                // The form starts on the role the current user is allowed to
                // create, so the "Add Employee" button opens the right one for
                // an HR Admin.
                if (!showForm) {
                  setForm((prev) => ({ ...prev, role: user?.role === 'HR_ADMIN' ? 'EMPLOYEE' : 'HR_ADMIN' }));
                }
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                showForm
                  ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              {showForm ? 'Close' : (<span className="inline-flex items-center gap-1.5"><Plus size={15} /> Add Employee</span>)}
            </button>
          </div>
        )}

        {showForm && canManage && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {form.role === 'EMPLOYEE' ? 'Add Employee' : 'Add HR Admin'}
            </h3>
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
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Employee Code
                  </label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.employeeCode}
                    onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                    placeholder="EMP-1001"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Enter the code manually. It must be unique and cannot be
                    changed once the account is created.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  >
                    <option value="">Select designation…</option>
                    {designations.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reporting Manager</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.reportingManager}
                    onChange={(e) => setForm({ ...form, reportingManager: e.target.value })}
                  >
                    <option value="">Select manager…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.name}>{e.name} ({e.employeeCode})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {form.role === 'HR_ADMIN' && (
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
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as NewAccount['role'] })}
                  >
                    {roleOptions.map((option) => (
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
                {isSubmitting ? 'Creating…' : form.role === 'EMPLOYEE' ? 'Create Employee' : 'Create HR Admin'}
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
                  <th className="px-4 py-3 font-medium text-slate-500">Employee Code</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Designation</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Reporting Manager</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Email</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Role</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-600">{account.employeeCode || '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{account.name}</td>
                    <td className="px-4 py-3 text-slate-600">{account.designation || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{account.reportingManager || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{account.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {ROLE_LABELS[account.role] || account.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                          account.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            account.isActive ? 'bg-green-500' : 'bg-red-500'
                          }`}
                        />
                        {account.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={account.isActive}
                          disabled={togglingId === account.id}
                          onChange={() => handleToggle(account)}
                          aria-label={`${account.isActive ? 'Active' : 'Inactive'} - toggle to ${account.isActive ? 'deactivate' : 'activate'}`}
                        />
                        <div className={`w-11 h-6 rounded-full peer transition-colors ${
                          account.isActive ? 'bg-green-500' : 'bg-slate-300'
                        } ${togglingId === account.id ? 'opacity-50' : ''}`}>
                          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            account.isActive ? 'translate-x-5' : 'translate-x-0'
                          } ${togglingId === account.id ? 'animate-pulse' : ''}`} />
                        </div>
                      </label>
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
