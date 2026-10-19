import { useState, useEffect } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { organizationService, Designation } from '../../services/organization.service';
import toast from 'react-hot-toast';

// The User Role page manages shared role/designation definitions only — not
// individual accounts. A definition (e.g. Manager, HR Admin, Employee) is a
// single shared record that many employees can hold; it never grants login
// privileges. Account provisioning stays in HR Staff/Employee Management.
const ROLES_THAT_CAN_MANAGE = ['SUPER_ADMIN', 'HR_ADMIN'];

export default function SuperAdminUserRolesPage() {
  const { user, logout } = useAuth();
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const userRole = user?.role || '';
  const canManage = ROLES_THAT_CAN_MANAGE.includes(userRole);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setDesignations(await organizationService.getDesignations());
    } catch {
      setError('Failed to load role definitions.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormActive(true);
    setEditingId(null);
    setFieldError(null);
    setShowForm(false);
  };

  const handleEdit = (item: Designation) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormDesc(item.description || '');
    setFormActive(item.isActive);
    setFieldError(null);
    setShowForm(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formName.trim()) {
      setFieldError('Role name is required.');
      return;
    }
    setIsSubmitting(true);
    setFieldError(null);
    try {
      if (editingId) {
        await organizationService.updateDesignation(editingId, {
          name: formName.trim(),
          description: formDesc.trim(),
          isActive: formActive,
        });
        toast.success('Role updated.');
      } else {
        await organizationService.createDesignation({
          name: formName.trim(),
          description: formDesc.trim(),
          isActive: formActive,
        });
        toast.success('Role created.');
      }
      resetForm();
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Operation failed.';
      setFieldError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: Designation) => {
    if (!confirm(`Delete the role "${item.name}"? This cannot be undone.`)) return;
    try {
      await organizationService.deleteDesignation(item.id);
      toast.success('Role deleted.');
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Delete failed.';
      toast.error(message);
    }
  };

  return (
    <DashboardShell role={userRole} userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="User Roles" subtitle="Shared role definitions (Manager, HR Admin, Employee)" />
      <div className="p-8 max-w-6xl">
        {canManage && (
          <div className="mb-4">
            <button
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              {showForm ? 'Close' : '+ New Role'}
            </button>
          </div>
        )}

        {showForm && canManage && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              {editingId ? 'Edit Role' : 'New Role'}
            </h3>
            {fieldError && <p className="mb-3 text-sm text-red-600">{fieldError}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role name</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Manager"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={3}
                  placeholder="What this role does"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="role-active"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                <label htmlFor="role-active" className="text-sm text-slate-700">Active</label>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : editingId ? 'Update Role' : 'Create Role'}
              </button>
            </form>
          </div>
        )}

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {isLoading ? (
          <p className="text-slate-500">Loading roles…</p>
        ) : designations.length === 0 ? (
          <p className="text-slate-500">No role definitions found.</p>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-slate-500">
              Role definitions are shared — many employees can hold the same role. These definitions
              do not grant login privileges; account access is managed separately in HR Staff/Employee
              Management.
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Employees</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {canManage && <th className="px-4 py-3 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {designations.map((desig) => (
                    <tr key={desig.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-700">{desig.name}</td>
                      <td className="px-4 py-3 text-slate-500">{desig.description || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{desig.employeeCount}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            desig.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {desig.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleEdit(desig)}
                              className="text-sm text-primary-600 hover:text-primary-700"
                            >
                              Edit
                            </button>
                            {desig.employeeCount === 0 && (
                              <button
                                onClick={() => handleDelete(desig)}
                                className="text-sm text-red-600 hover:text-red-700"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      )}
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
