import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { holidayService, type Holiday } from '../../services/holiday.service';
import api from '../../services/api';
import toast from 'react-hot-toast';
import StatusBadge from '../../components/shared/StatusBadge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';

const CARD =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';

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
      <div className="p-6 max-w-6xl">
        {canManage && (
          <div className="mb-4">
            <Button
              variant={showForm ? 'secondary' : 'primary'}
              onClick={() => {
                resetForm();
                setEditingId(null);
                setShowForm(!showForm);
              }}
            >
              {showForm ? (
                <span className="inline-flex items-center gap-1"><Pencil size={14} /> Close</span>
              ) : (
                <span className="inline-flex items-center gap-1"><Plus size={14} /> New Holiday</span>
              )}
            </Button>
          </div>
        )}

        {showForm && canManage && (
          <div className={`mb-6 p-4 sm:p-5 ${CARD}`}>
            <h3 className="mb-4 text-[15px] font-bold tracking-tight text-slate-900">
              {editingId ? 'Edit Holiday' : 'New Holiday'}
            </h3>
            {fieldError && <p className="mb-3 text-[13px] text-red-600">{fieldError}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Name</label>
                  <input
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Diwali"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Date</label>
                  <input
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-slate-700">
                <input
                  type="checkbox"
                  checked={formRecurring}
                  onChange={(e) => setFormRecurring(e.target.checked)}
                  className="h-4 w-4 rounded accent-cyan-600"
                />
                Recurring every year
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isSubmitting} isLoading={isSubmitting}>
                  {isSubmitting ? 'Saving…' : editingId ? 'Save' : 'Create'}
                </Button>
                <Button variant="ghost" size="sm" type="button" onClick={() => { resetForm(); setEditingId(null); setShowForm(false); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-inset ring-red-100">{error}</p>}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
            <Spinner size="md" /> Loading…
          </div>
        ) : (
          <div className={`overflow-x-auto ${CARD}`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Recurring</th>
                  {canManage && <th className="px-4 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {holidays.map((holiday) => (
                  <tr key={holiday.id} className="border-t border-slate-100 text-[13px] hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold text-slate-900">{holiday.name}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(holiday.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={holiday.isRecurring ? 'emerald' : 'slate'}>
                        {holiday.isRecurring ? 'Yes' : 'No'}
                      </StatusBadge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingId(String(holiday.id));
                              setFormName(holiday.name);
                              setFormDate(holiday.date.slice(0, 10));
                              setFormRecurring(holiday.isRecurring);
                              setShowForm(true);
                            }}
                          >
                            <Pencil size={13} /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleDelete(holiday)}
                          >
                            <Trash2 size={13} /> Delete
                          </Button>
                        </div>
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
