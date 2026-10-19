import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { holidayService, type Holiday } from '../../services/holiday.service';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function SuperAdminHolidaysPage() {
  const { user, logout } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formRecurring, setFormRecurring] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await holidayService.list();
      setHolidays(rows);
    } catch {
      setError('Failed to load holidays.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormDate('');
    setFormRecurring(false);
    setFieldError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formName.trim() || !formDate) {
      setFieldError('A name and a date are required.');
      return;
    }
    setIsSubmitting(true);
    setFieldError(null);
    try {
      const payload = {
        name: formName.trim(),
        date: formDate,
        isRecurring: formRecurring,
      };
      if (editingId) {
        await api.patch(`/holidays/${editingId}`, payload);
      } else {
        await api.post('/holidays', payload);
      }
      toast.success(editingId ? 'Holiday updated.' : 'Holiday created.');
      resetForm();
      load();
    } catch {
      setFieldError('Could not save the holiday. Check for duplicate dates.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (holiday: Holiday) => {
    if (!confirm(`Delete the holiday "${holiday.name}"?`)) return;
    try {
      await api.delete(`/holidays/${holiday.id}`);
      toast.success('Holiday deleted.');
      load();
    } catch {
      setError('Could not delete the holiday.');
    }
  };

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  return (
    <DashboardShell role="SUPER_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Holidays" subtitle="Company holiday calendar" />
      <div className="p-8 max-w-6xl">
        {canManage && (
          <div className="mb-4">
            <button
              onClick={() => {
                resetForm();
                setEditingId(null);
                setShowForm(!showForm);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              {showForm ? 'Close' : '+ New Holiday'}
            </button>
          </div>
        )}

        {showForm && canManage && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">{editingId ? 'Edit Holiday' : 'New Holiday'}</h3>
            {fieldError && <p className="mb-3 text-sm text-red-600">{fieldError}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Diwali"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formRecurring}
                  onChange={(e) => setFormRecurring(e.target.checked)}
                />
                Recurring every year
              </label>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : editingId ? 'Save' : 'Create'}
              </button>
            </form>
          </div>
        )}

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {isLoading ? (
          <p className="text-slate-500">Loading holidays…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-500">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Recurring</th>
                  {canManage && <th className="px-4 py-3 font-medium text-slate-500">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {holidays.map((holiday) => (
                  <tr key={holiday.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-700">{holiday.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(holiday.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{holiday.isRecurring ? 'Yes' : 'No'}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setEditingId(String(holiday.id));
                            setFormName(holiday.name);
                            setFormDate(holiday.date.slice(0, 10));
                            setFormRecurring(holiday.isRecurring);
                          }}
                          className="mr-2 rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(holiday)}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
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
