import { useState, useEffect } from 'react';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { organizationService } from '../../services/organization.service';
import { useAuth } from '../../contexts/AuthContext';
import type { Department } from '../../services/organization.service';

const ROLES_THAT_CAN_MANAGE = ['SUPER_ADMIN', 'HR_ADMIN'];

export default function DepartmentListPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
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
      const data = await organizationService.getDepartments();
      setDepartments(data);
    } catch {
      setError('Failed to load departments.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setFormName('');
    setFormDesc('');
    setFormActive(true);
    setEditingId(null);
    setFieldError(null);
    setShowForm(false);
  };

  const handleEdit = (dept: Department) => {
    setEditingId(dept.id);
    setFormName(dept.name);
    setFormDesc(dept.description || '');
    setFormActive(dept.isActive);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFieldError('Department name is required.');
      return;
    }
    setIsSubmitting(true);
    setFieldError(null);
    try {
      if (editingId) {
        await organizationService.updateDepartment(editingId, {
          name: formName,
          description: formDesc,
          isActive: formActive,
        });
      } else {
        await organizationService.createDepartment({
          name: formName,
          description: formDesc,
          isActive: formActive,
        });
      }
      resetForm();
      load();
    } catch (err) {
      setFieldError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this department? This cannot be undone.')) return;
    try {
      await organizationService.deleteDepartment(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  return (
    <DashboardShell role={userRole} userName={user?.email || ''} userEmail={user?.email || ''} onLogout={async () => {}}>
      <Header title="Departments" subtitle="Manage organizational departments" />
      <div className="p-6">
        {canManage && (
          <div className="mb-5">
            <Button
              onClick={() => { resetForm(); setShowForm(!showForm); }}
              variant={showForm ? 'secondary' : 'primary'}
            >
              {showForm ? 'Cancel' : '+ New Department'}
            </Button>
          </div>
        )}

        {showForm && (
          <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <h3 className="text-[15px] font-bold tracking-tight text-slate-900 mb-4">{editingId ? 'Edit Department' : 'New Department'}</h3>
            {fieldError && <p className="mb-3 text-[13px] text-red-600">{fieldError}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="dept-name" className="mb-1.5 block text-[12px] font-medium text-slate-600">Name</label>
                <input id="dept-name" type="text" value={formName} onChange={(e) => setFormName(e.target.value)} disabled={isSubmitting} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:bg-slate-100" />
              </div>
              <div>
                <label htmlFor="dept-desc" className="mb-1.5 block text-[12px] font-medium text-slate-600">Description</label>
                <textarea id="dept-desc" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} disabled={isSubmitting} rows={3} className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:bg-slate-100" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} disabled={isSubmitting} className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500/20" />
                <label htmlFor="isActive" className="text-[13px] text-slate-700">Active</label>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Button type="submit" isLoading={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </Button>
                {editingId && (
                  <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
                )}
              </div>
            </form>
          </div>
        )}

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-[13px] text-red-700">{error}</p></div>}

        {isLoading ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
              <Spinner size="md" /> Loading…
            </div>
          </div>
        ) : departments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <EmptyState title="No departments found" description="Create a department to start organizing employees." />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Name</th>
                  <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Description</th>
                  <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employees</th>
                  <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</th>
                  {canManage && <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-[13px] font-semibold text-slate-900">{dept.name}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-500">{dept.description || '—'}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">{dept.employeeCount}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${dept.isActive ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                        {dept.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-4">
                          <button onClick={() => handleEdit(dept)} className="text-[13px] font-medium text-cyan-600 hover:text-cyan-700">Edit</button>
                          {dept.employeeCount === 0 && (
                            <button onClick={() => handleDelete(dept.id)} className="text-[13px] font-medium text-red-600 hover:text-red-700">Delete</button>
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
