import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, KeyRound, Trash2 } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { organizationService } from '../../services/organization.service';
import toast from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';

// The list endpoint flattens a single `name` column, which is frequently
// empty (the split `firstName`/`lastName` are always populated).
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

const ROLE_LABELS: Record<string, string> = {
  HR_ADMIN: 'HR Admin',
  EMPLOYEE: 'Employee',
};

/**
 * Accounts — the manage screen for HR Admin / Employee login accounts.
 *
 * Creating happens in the SHARED "Add Employee" view (/admin/employees/new),
 * the same one the Employee Details page opens — there is no separate
 * inline form here anymore. The button just deep-links to that view; the
 * view itself is role-aware (a Super Admin provisions an HR Admin, an HR
 * Admin provisions an Employee).
 */
export default function SuperAdminAdminsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Reset-password state: which account the modal is open for + the new value.
  const [resetTarget, setResetTarget] = useState<AdminAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Delete-account state: the confirmation modal target + in-flight id.
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';
  // The Super Admin can reset any account (including HR Admins and their own);
  // an HR Admin is limited to Employee accounts — the server enforces the same.
  const canReset = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';
  // Super Admins provision HR Admin accounts; HR Admins provision Employees.
  const addLabel = user?.role === 'SUPER_ADMIN' ? 'Add HR Admin' : 'Add Employee';

  const openReset = (account: AdminAccount) => {
    setResetTarget(account);
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const closeReset = () => {
    setResetTarget(null);
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
      closeReset();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not reset the password.';
      toast.error(message);
    } finally {
      setResetting(false);
    }
  };

  const openDelete = (account: AdminAccount) => {
    setDeleteTarget(account);
  };

  const closeDelete = () => setDeleteTarget(null);

  const handleDelete = async () => {
    if (!deleteTarget || deletingId) return;
    setDeletingId(deleteTarget.id);
    try {
      await organizationService.deleteAdminAccount(deleteTarget.id);
      toast.success(`Account for ${deleteTarget.name} deleted.`);
      closeDelete();
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not delete the account.';
      toast.error(message);
      closeDelete();
    } finally {
      setDeletingId(null);
    }
  };

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setAccounts(await fetchAccounts());
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
              <Button size="sm" onClick={() => navigate('/admin/employees/new')}>
                <span className="inline-flex items-center gap-1.5">
                  <Plus size={15} /> {addLabel}
                </span>
              </Button>
            ) : null}
          </div>
          <p className="text-[13px] text-slate-500">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </p>
        </div>

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
                        <div className="flex items-center gap-3">
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
                          {canReset && (
                            <button
                              type="button"
                              onClick={() => openReset(account)}
                              className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-cyan-300 hover:text-cyan-700"
                              title={`Reset ${account.name}'s password`}
                            >
                              <KeyRound size={14} />
                            </button>
                          )}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => openDelete(account)}
                              className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-red-300 hover:text-red-600"
                              title={`Delete ${account.name}'s account`}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Reset password modal */}
        <Modal
          isOpen={resetTarget !== null}
          onClose={closeReset}
          title={resetTarget ? `Reset password — ${resetTarget.name}` : 'Reset password'}
          footer={
            <>
              <Button variant="secondary" onClick={closeReset} disabled={resetting}>
                Cancel
              </Button>
              <Button onClick={handleReset} isLoading={resetting}>
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
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Confirm password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter the new password"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
                />
              </div>
            </div>
          )}
        </Modal>

        {/* Delete account modal — the stale-entry cleanup */}
        <Modal
          isOpen={deleteTarget !== null}
          onClose={closeDelete}
          title={deleteTarget ? `Delete account — ${deleteTarget.name}` : 'Delete account'}
          footer={
            <>
              <Button variant="secondary" onClick={closeDelete} disabled={!!deletingId}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                isLoading={!!deletingId}
                disabled={!!deletingId}
              >
                {deletingId ? 'Deleting…' : 'Delete account'}
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
              <p className="text-[13px] text-slate-500">
                Use this to clear <strong className="text-slate-700">stale entries</strong> — accounts
                that appear in Accounts but have no reachable employee record.
              </p>
            </div>
          )}
        </Modal>
      </div>
    </DashboardShell>
  );
}
