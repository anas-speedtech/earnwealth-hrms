import { useState, useEffect } from 'react';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
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
      <div className="p-8">
        {canManage && (
          <div className="mb-4">
            <button
              onClick={() => { resetForm(); setShowForm(!showForm); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              {showForm ? 'Cancel' : '+ New Department'}
            </button>
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">{editingId ? 'Edit Department' : 'New Department'}</h3>
            {fieldError && <p className="text-sm text-red-600 mb-3">{fieldError}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} disabled={isSubmitting} rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} disabled={isSubmitting} />
                <label htmlFor="isActive" className="text-sm text-slate-700">Active</label>
              </div>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {isSubmitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </form>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"><p className="text-sm text-red-700">{error}</p></div>}

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : departments.length === 0 ? (
          <div className="text-center py-12"><p className="text-slate-500">No departments found.</p></div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Name</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Description</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Employees</th>
                  <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Status</th>
                  {canManage && <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{dept.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{dept.description || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{dept.employeeCount}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${dept.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
                        {dept.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 flex gap-3">
                        <button onClick={() => handleEdit(dept)} className="text-sm text-primary-600 hover:text-primary-700">Edit</button>
                        {dept.employeeCount === 0 && (
                          <button onClick={() => handleDelete(dept.id)} className="text-sm text-red-600 hover:text-red-700">Delete</button>
                        )}
                      </td>
                    )}
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
