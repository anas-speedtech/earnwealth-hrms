import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Trash2, Power } from 'lucide-react';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import { organizationService, TeamAccount } from '../../services/organization.service';
import type { Employee, Department, Designation, PaginatedResponse } from '../../services/organization.service';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'ON_LEAVE', label: 'On Leave' },
];

const ROLE_LABELS: Record<string, string> = {
  HR_ADMIN: 'HR Admin',
  EMPLOYEE: 'Employee',
};

const CARD =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';

const inputCls =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10';

/**
 * Team — the single place for addition, editing and account management.
 * Merges the old "Accounts" (login accounts) and "Employee Details"
 * (employee directory) screens: one list of every team member, each row
 * carrying View/Edit plus the account actions (reset password,
 * activate/deactivate, delete). Standalone accounts with no reachable
 * employee record (stale entries) appear in their own card below, where
 * they can finally be cleaned up.
 */
export default function EmployeeListPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [accounts, setAccounts] = useState<TeamAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Server-side column sort: whitelisted on the backend, so only known keys
  // reach SQL. Clicking a header toggles direction for the active column.
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Account-action state (all keyed by users.id, the login account id).
  const [resetTarget, setResetTarget] = useState<TeamAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';
  const filtersActive = Boolean(search || departmentFilter || designationFilter || statusFilter);

  // Join the account actions onto employee rows by the shared users.id link
  // (Employee.userId is the users.id string; TeamAccount.id is the same key).
  const accountsByUserId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const accountFor = (emp: Employee): TeamAccount | undefined =>
    emp.userId ? accountsByUserId.get(emp.userId) : undefined;

  // Stale entries: login accounts with no reachable employee record.
  const standaloneAccounts = useMemo(
    () => (filtersActive ? [] : accounts.filter((a) => !a.employeeCode)),
    [accounts, filtersActive],
  );

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result: PaginatedResponse<Employee> = await organizationService.getEmployees({
        page,
        search,
        departmentId: departmentFilter,
        designationId: designationFilter,
        status: statusFilter,
        sortBy,
        sortDir,
      });
      setEmployees(result.data);
      setTotalPages(result.pagination.pages);
    } catch {
      setError('Failed to load the team.');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, departmentFilter, designationFilter, statusFilter, sortBy, sortDir]);

  const fetchAccounts = useCallback(async () => {
    try {
      setAccounts(await organizationService.getTeamAccounts());
    } catch {
      // Account actions stay unavailable if the list cannot load; the
      // directory itself still works.
    }
  }, []);

  const fetchFilters = useCallback(async () => {
    try {
      setDepartments(await organizationService.getDepartments());
    } catch {
      setDepartments([]);
    }
    try {
      setDesignations(await organizationService.getDesignations());
    } catch {
      setDesignations([]);
    }
  }, []);

  useEffect(() => {
    fetchFilters();
    fetchAccounts();
  }, [fetchFilters, fetchAccounts]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const reload = () => {
    fetchEmployees();
    fetchAccounts();
  };

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      // Status sorts on isActive, so desc = Active-first (the natural start).
      setSortDir(column === 'status' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEmployees();
  };

  // ---- Account actions (keyed by users.id) ----

  const openReset = (account: TeamAccount) => {
    setResetTarget(account);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleReset = async () => {
    if (!resetTarget || resetting) return;
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setResetting(true);
    try {
      await organizationService.resetAdminPassword(resetTarget.id, newPassword);
      toast.success(`Password updated for ${resetTarget.name}. They must sign in again.`);
      setResetTarget(null);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not reset the password.';
      toast.error(message);
    } finally {
      setResetting(false);
    }
  };

  const handleToggle = async (account: TeamAccount) => {
    if (togglingId) return; // Prevent repeated requests
    setTogglingId(account.id);
    try {
      await organizationService.setTeamAccountStatus(account.id, !account.isActive);
      toast.success(`Account ${!account.isActive ? 'activated' : 'deactivated'}.`);
      reload();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not update the account.';
      toast.error(message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await organizationService.deleteAdminAccount(deleteTarget.id);
      toast.success(`Account for ${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      reload();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not delete the account.';
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || '';

  return (
    <DashboardShell role={user?.role || ''} userName={displayName} userEmail={user?.email || ''} onLogout={async () => {}}>
      <Header title="Team" subtitle="Add, view and manage every team member in one place" />
      <div className="p-6">
        {/* Toolbar: filters + the single Add entry point */}
        <div className={`mb-5 p-5 ${CARD}`}>
          <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="employee-search" className="mb-1.5 block text-[12px] font-medium text-slate-600">Search</label>
              <input
                id="employee-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, or employee code"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="filter-department" className="mb-1.5 block text-[12px] font-medium text-slate-600">Department</label>
              <select
                id="filter-department"
                value={departmentFilter}
                onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                className={inputCls}
              >
                <option value="">All Departments</option>
                {departments.filter((d) => d.isActive).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-designation" className="mb-1.5 block text-[12px] font-medium text-slate-600">Designation</label>
              <select
                id="filter-designation"
                value={designationFilter}
                onChange={(e) => { setDesignationFilter(e.target.value); setPage(1); }}
                className={inputCls}
              >
                <option value="">All Designations</option>
                {designations.filter((d) => d.isActive).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-status" className="mb-1.5 block text-[12px] font-medium text-slate-600">Status</label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className={inputCls}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-between gap-3 sm:col-span-2 lg:col-span-4">
              <Button type="submit" size="md">Search</Button>
              {canManage && (
                <Link
                  to="/admin/employees/new"
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-cyan-600 px-3.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-cyan-700"
                >
                  + Add Member
                </Link>
              )}
            </div>
          </form>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-[13px] text-red-700">{error}</p>
            <button onClick={fetchEmployees} className="mt-2 text-[13px] text-red-600 underline">Retry</button>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
            <Spinner size="md" /> Loading…
          </div>
        )}

        {!isLoading && !error && employees.length === 0 && (
          <div className={CARD}>
            <EmptyState
              title="No team members found"
              description="No one matches the current search and filter criteria."
            />
          </div>
        )}

        {!isLoading && !error && employees.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/60">
                  <tr>
                    <SortableTh label="ID" column="employeeCode" active={sortBy} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Member" column="name" active={sortBy} dir={sortDir} onSort={toggleSort} />
                    <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Role</th>
                    <SortableTh label="Department" column="department" active={sortBy} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Designation" column="designation" active={sortBy} dir={sortDir} onSort={toggleSort} />
                    <SortableTh label="Status" column="status" active={sortBy} dir={sortDir} onSort={toggleSort} />
                    <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const account = accountFor(emp);
                    return (
                      <tr key={emp.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="text-[13px] font-semibold text-slate-900">{emp.employeeCode}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-[13px] font-semibold text-slate-900">{emp.firstName} {emp.lastName}</p>
                            <p className="text-xs text-slate-400">{emp.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {account ? (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                              account.role === 'HR_ADMIN'
                                ? 'bg-purple-50 text-purple-700 ring-purple-200'
                                : 'bg-slate-100 text-slate-600 ring-slate-200/80'
                            }`}>
                              {ROLE_LABELS[account.role] || account.role}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">No account</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">{emp.department?.name || '—'}</td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">{emp.designation?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${getStatusColor(emp.status)}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Link to={`/admin/employees/${emp.id}`} className="text-[13px] font-medium text-cyan-600 hover:text-cyan-700">
                              View
                            </Link>
                            {account && (
                              <>
                                <IconAction title={`Reset ${account.name}'s password`} disabled={togglingId === account.id} onClick={() => openReset(account)}>
                                  <KeyRound size={14} />
                                </IconAction>
                                <IconAction
                                  title={account.isActive ? `Deactivate ${account.name}'s account` : `Activate ${account.name}'s account`}
                                  disabled={togglingId === account.id}
                                  onClick={() => void handleToggle(account)}
                                >
                                  <Power size={14} className={account.isActive ? 'text-emerald-600' : 'text-slate-300'} />
                                </IconAction>
                                <IconAction title={`Delete ${account.name}'s account`} tone="danger" disabled={deleting} onClick={() => setDeleteTarget(account)}>
                                  <Trash2 size={14} />
                                </IconAction>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between px-4 py-3">
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </Button>
                <span className="text-[13px] text-slate-600">Page {page} of {totalPages}</span>
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  Next
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Standalone accounts — stale entries with no reachable employee record */}
        {!filtersActive && standaloneAccounts.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[12px] font-medium text-slate-500">
              Standalone accounts ({standaloneAccounts.length}) — these have no linked employee record.
            </p>
            <div className="overflow-hidden rounded-2xl border border-amber-200/70 bg-amber-50/40">
              {standaloneAccounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 border-t border-amber-100 px-4 py-3 first:border-t-0">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-slate-900">{a.name}</p>
                    <p className="truncate text-xs text-slate-400">{a.email} · {ROLE_LABELS[a.role] || a.role}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <IconAction title={`Reset ${a.name}'s password`} onClick={() => openReset(a)}>
                      <KeyRound size={14} />
                    </IconAction>
                    <IconAction
                      title={a.isActive ? `Deactivate ${a.name}'s account` : `Activate ${a.name}'s account`}
                      onClick={() => void handleToggle(a)}
                    >
                      <Power size={14} className={a.isActive ? 'text-emerald-600' : 'text-slate-300'} />
                    </IconAction>
                    <IconAction title={`Delete ${a.name}'s account`} tone="danger" onClick={() => setDeleteTarget(a)}>
                      <Trash2 size={14} />
                    </IconAction>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reset password modal */}
        <Modal
          isOpen={resetTarget !== null}
          onClose={() => setResetTarget(null)}
          title={resetTarget ? `Reset password — ${resetTarget.name}` : 'Reset password'}
          footer={
            <>
              <Button variant="secondary" onClick={() => setResetTarget(null)} disabled={resetting}>
                Cancel
              </Button>
              <Button onClick={() => void handleReset()} isLoading={resetting}>
                {resetting ? 'Resetting…' : 'Update password'}
              </Button>
            </>
          }
        >
          {resetTarget && (
            <div className="space-y-4">
              <p className="text-[13px] text-slate-500">
                Set a new password for <strong className="text-slate-700">{resetTarget.name}</strong>{' '}
                ({resetTarget.email}). The change revokes all of their active sessions — they will
                have to sign in again.
              </p>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={inputCls}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Confirm password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter the new password"
                  className={inputCls}
                />
              </div>
            </div>
          )}
        </Modal>

        {/* Delete account modal — the stale-entry cleanup */}
        <Modal
          isOpen={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          title={deleteTarget ? `Delete account — ${deleteTarget.name}` : 'Delete account'}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete account'}
              </Button>
            </>
          }
        >
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-[13px] text-slate-500">
                This permanently removes the account for{' '}
                <strong className="text-slate-700">{deleteTarget.name}</strong> ({deleteTarget.email})
                and its linked employee record, along with the attendance, leave and payroll
                data tied to it. This cannot be undone.
              </p>
            </div>
          )}
        </Modal>
      </div>
    </DashboardShell>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'INACTIVE': return 'bg-slate-100 text-slate-600 ring-slate-200';
    case 'SUSPENDED': return 'bg-red-50 text-red-700 ring-red-200';
    case 'ON_LEAVE': return 'bg-amber-50 text-amber-700 ring-amber-200';
    default: return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}

// A clickable table header that toggles the server-side column sort.
function SortableTh({
  label,
  column,
  active,
  dir,
  onSort,
}: {
  label: string;
  column: string;
  active: string;
  dir: 'asc' | 'desc';
  onSort: (column: string) => void;
}) {
  const isActive = active === column;
  return (
    <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors ${
          isActive ? 'text-cyan-600' : 'hover:text-slate-600'
        }`}
      >
        {label}
        <span className="text-[9px] leading-none text-slate-400">
          {isActive ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

// A compact, title-labelled icon button for the per-row account actions.
function IconAction({
  title,
  tone,
  disabled,
  onClick,
  children,
}: {
  title: string;
  tone?: 'danger';
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md border text-slate-500 transition-colors disabled:opacity-50 ${
        tone === 'danger'
          ? 'border-slate-200 hover:border-red-300 hover:text-red-600'
          : 'border-slate-200 hover:border-cyan-300 hover:text-cyan-700'
      }`}
    >
      {children}
    </button>
  );
}
