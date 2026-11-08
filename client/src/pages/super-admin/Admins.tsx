import { useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { organizationService, Designation } from '../../services/organization.service';
import { leaveService, LeaveTypeItem } from '../../services/leave.service';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

// The list endpoint flattens a single `name` column, which is frequently
// empty (the split `firstName`/`lastName` are always populated). We only need
// these fields for the manager picker, so keep the shape narrow.
interface EmployeeRow {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
}

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
  joiningDate: string;
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
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeItem[]>([]);
  const [selectedLeaveTypes, setSelectedLeaveTypes] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<NewAccount>({
    name: '',
    email: '',
    password: '',
    employeeCode: '',
    designation: '',
    reportingManager: '',
    role: 'HR_ADMIN',
    joiningDate: '',
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
        // The list endpoint pages at 20 (search matches code / name /
        // designation), so fetch every page to keep the manager picker
        // complete. Accumulate all rows, then dedupe by employee code
        // (the list endpoint's flat `name` column is often empty — the
        // split `firstName`/`lastName` are always populated).
        let page = 1;
        const allRows: EmployeeRow[] = [];
        for (;;) {
          const result = await organizationService.getEmployees({ page });
          const rows = result.data || [];
          allRows.push(...rows);
          if (page >= result.pagination.pages || rows.length === 0) break;
          page += 1;
        }
        if (!mounted) return;
        setEmployees(
          [...new Map(
            allRows
              .filter((e) => (e.employeeCode && e.employeeCode.trim()))
              .map((e) => [e.employeeCode as string, e] as const)
          ).values()]
            .map((e) => ({
              id: e.id,
              name:
                (e.name && e.name.trim()) ||
                ((e.firstName || e.lastName) ? [e.firstName, e.lastName].filter(Boolean).join(' ') : 'Unknown'),
              employeeCode: e.employeeCode || '',
            })),
        );
      } catch {
        // non-critical
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load leave types so the create form can let an admin opt in/out of which
  // types a new employee receives. Maternity / Paternity are excluded by
  // default since they aren't applicable to everyone.
  const isMaternityOrPaternity = (t: LeaveTypeItem) => {
    const code = (t.code || '').toUpperCase();
    const name = (t.displayName || t.name || '').toLowerCase();
    return (
      ['MAT', 'PTE', 'PAT', 'MLE'].includes(code) ||
      name.includes('maternity') ||
      name.includes('paternity')
    );
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await leaveService.getAllLeaveTypes();
        if (!mounted) return;
        setLeaveTypes(list);
        setSelectedLeaveTypes(
          Object.fromEntries(
            list.map((t) => [t.id, !isMaternityOrPaternity(t)]),
          ),
        );
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
    // created here (HR Admin and Employee). Rules: digits only, min 3 digits
    // (may start with 0), and unique across all existing accounts + employees.
    // The server enforces the same rules; this is the fast, friendly check.
    const code = form.employeeCode.trim();
    if (!code) {
      setFieldError('Employee code is required. Enter the code manually — it is not auto-generated.');
      return;
    }
    if (!/^\d+$/.test(code)) {
      setFieldError('Employee code must contain numbers only.');
      return;
    }
    if (code.length < 3) {
      setFieldError('Employee code must be at least 3 digits.');
      return;
    }
    const usedCodes = new Set<string>();
    accounts.forEach((a) => { if (a.employeeCode) usedCodes.add(a.employeeCode); });
    employees.forEach((e) => { if (e.employeeCode) usedCodes.add(e.employeeCode); });
    if (usedCodes.has(code)) {
      setFieldError(`Employee code ${code} is already in use. Choose a different code.`);
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
    // Only leave types the admin checked are configured for the new employee;
    // maternity/paternity are unchecked by default so they're excluded.
    const selectedTypeIds = leaveTypes
      .filter((t) => selectedLeaveTypes[t.id])
      .map((t) => t.id);
    try {
      await api.post('/admin-users', {
        name: form.name,
        email: form.email,
        password: form.password || '',
        role: form.role,
        employeeCode: form.employeeCode || '',
        designation: form.designation || '',
        reportingManager: form.reportingManager || '',
        joiningDate: form.joiningDate || undefined,
        leaveTypes: selectedTypeIds,
      });
      toast.success(`Account created for ${form.email}.`);
      setShowForm(false);
      setForm({ name: '', email: '', password: '', employeeCode: '', designation: '', reportingManager: '', role: 'HR_ADMIN', joiningDate: '' });
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
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Toolbar */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            {canManage ? (
              <Button
                variant={showForm ? 'secondary' : 'primary'}
                size="sm"
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
              >
                {showForm
                  ? 'Close'
                  : (
                      <span className="inline-flex items-center gap-1.5">
                        <Plus size={15} /> Add Employee
                      </span>
                    )}
              </Button>
            ) : null}
          </div>
          <p className="text-[13px] text-slate-500">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </p>
        </div>

        {showForm && canManage && (
          <div className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <h3 className="mb-5 text-[15px] font-bold tracking-tight text-slate-900">
              {form.role === 'EMPLOYEE' ? 'Add Employee' : 'Add HR Admin'}
            </h3>
            {fieldError && (
              <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-600/10">{fieldError}</p>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Full name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Asha Rao"
                  required
                />
                <Input
                  label="Email address"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@company.com"
                  required
                />
                <div>
                  <Input
                    label="Employee Code"
                    value={form.employeeCode}
                    onChange={(e) =>
                      setForm({ ...form, employeeCode: e.target.value.replace(/\D/g, '') })
                    }
                    placeholder="e.g. 1001"
                    inputMode="numeric"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Numbers only, minimum 3 digits (may start with 0). It must
                    be unique and cannot be changed once the account is created.
                  </p>
                </div>
                <Select
                  label="Designation"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  options={[
                    { value: '', label: 'Select designation…' },
                    ...designations.map((d) => ({ value: d.name, label: d.name })),
                  ]}
                />
                <Select
                  label="Reporting Manager"
                  value={form.reportingManager}
                  onChange={(e) => setForm({ ...form, reportingManager: e.target.value })}
                  options={[
                    { value: '', label: 'Select manager…' },
                    ...employees.map((e) => ({
                      value: e.name,
                      label: `${e.name} (${e.employeeCode})`,
                    })),
                  ]}
                />
                <Input
                  label="Date of Joining"
                  type="date"
                  value={form.joiningDate}
                  onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                />
                <div className="sm:col-span-2">
                  <Input
                    label={form.role === 'HR_ADMIN' ? 'Password' : 'Password (optional)'}
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={form.role === 'HR_ADMIN' ? 'At least 8 characters' : 'Leave blank to email an invitation instead'}
                    required={form.role === 'HR_ADMIN'}
                  />
                </div>
                <Select
                  label="Role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as NewAccount['role'] })}
                  options={roleOptions.map((option) => ({ value: option.value, label: option.label }))}
                />
              </div>

              {form.role === 'EMPLOYEE' && leaveTypes.length > 0 && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                  <h4 className="text-[13px] font-semibold text-slate-900">Available leave types</h4>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Select which leave types this employee gets. Maternity / Paternity are usually not applicable to everyone.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {leaveTypes.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-[13px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedLeaveTypes[t.id] ?? false}
                          onChange={(e) =>
                            setSelectedLeaveTypes((prev) => ({ ...prev, [t.id]: e.target.checked }))
                          }
                          className="h-4 w-4 rounded accent-cyan-600"
                        />
                        {t.displayName || t.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                  {isSubmitting ? 'Creating…' : form.role === 'EMPLOYEE' ? 'Create Employee' : 'Create HR Admin'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setFieldError(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </form>
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-600/10">{error}</p>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-[13px] text-slate-500">
            <Spinner size="md" />
            <span>Loading accounts…</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <EmptyState
              icon={<Users size={28} />}
              title="No accounts yet"
              description="Create the first account to get started."
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/60 text-left">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Employee Code</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Designation</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Reporting Manager</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-600">{account.employeeCode || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{account.name}</p>
                        <p className="text-xs text-slate-400">{account.email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{account.designation || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{account.reportingManager || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200/80">
                          {ROLE_LABELS[account.role] || account.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                            account.isActive
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15'
                              : 'bg-red-50 text-red-700 ring-red-600/15'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              account.isActive ? 'bg-emerald-500' : 'bg-red-500'
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
                          <div className={`w-9 h-5 rounded-full peer transition-colors duration-150 ${
                            account.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                          } ${togglingId === account.id ? 'opacity-50' : ''}`}>
                            <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-150 ${
                              account.isActive ? 'translate-x-4' : 'translate-x-0'
                            } ${togglingId === account.id ? 'animate-pulse' : ''}`} />
                          </div>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
