import { useState, useEffect, useMemo } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { wfhService, WFHRequest } from '../../services/wfh.service';
import { holidayService, Holiday } from '../../services/holiday.service';
import { compoffService } from '../../services/compoff.service';
import toast from 'react-hot-toast';

// WFH windows: future dates only, up to 3 months ahead (enforced server-side
// too — these just keep the picker honest).
function addMonths(key: string, months: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

export default function EmployeeWFHPage() {
  const { user, logout } = useAuth();
  const [requests, setRequests] = useState<WFHRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ requestDate: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [compOffAvailable, setCompOffAvailable] = useState<number | null>(null);

  // Future dates only (not today), up to 3 months ahead. The string
  // comparisons in handleSubmit mirror the server rule exactly; the picker's
  // min/max just keep the browser UI honest.
  const todayKey = new Date().toISOString().slice(0, 10);
  const tomorrowKey = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const maxSelectable = addMonths(todayKey, 3);

  const fetchRequests = async () => {
    try {
      const result = await wfhService.listMy();
      setRequests(result.requests);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // Week-off / holiday detection for the comp-off note, plus the current
    // comp-off credit balance so the note can say how many days are on hand.
    holidayService.list().then(setHolidays).catch(() => {});
    compoffService.getMyBalance().then((b) => setCompOffAvailable(b.available)).catch(() => {});
  }, []);

  // What day-class is the picked WFH date: a working day, a calendar
  // weekend, and/or a company holiday. Weekend + holiday work earns comp-off.
  const dayInfo = useMemo(() => {
    if (!formData.requestDate) return null;
    const d = new Date(formData.requestDate + 'T00:00:00');
    const dow = d.getDay(); // 0=Sun, 6=Sat
    const holiday = holidays.find((h) => h.date.slice(0, 10) === formData.requestDate);
    return {
      isWeekend: dow === 0 || dow === 6,
      holiday,
    };
  }, [formData.requestDate, holidays]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.requestDate || !formData.reason) {
      toast.error('Please fill in all fields.');
      return;
    }
    if (formData.requestDate <= todayKey) {
      toast.error('Choose a future date — WFH cannot be applied for today or past days.');
      return;
    }
    if (formData.requestDate > maxSelectable) {
      toast.error('WFH can be requested up to 3 months in advance only.');
      return;
    }

    setSubmitting(true);
    try {
      await wfhService.create(formData.requestDate, formData.reason);
      toast.success('WFH request submitted!');
      setFormData({ requestDate: '', reason: '' });
      setShowForm(false);
      fetchRequests();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to submit request.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (requestId: string) => {
    try {
      await wfhService.cancel(requestId);
      toast.success('Request cancelled.');
      fetchRequests();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to cancel.';
      toast.error(message);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-700',
      APPROVED: 'bg-emerald-100 text-emerald-700',
      REJECTED: 'bg-red-100 text-red-700',
      CANCELLED: 'bg-slate-100 text-slate-600',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-slate-100 text-slate-700'}`}>
        {status}
      </span>
    );
  };

  const formatDate = (iso: string) => {
    return new Date(iso + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <DashboardShell
      role="EMPLOYEE"
      userName={(user?.profile?.firstName && user?.profile?.lastName)
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : user?.email || 'Employee'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Work From Home" subtitle="Request and manage WFH days" />
      <div className="p-8 max-w-3xl">
        {/* Request Button */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="mb-6 px-4 py-2 bg-cyan-600 text-white rounded-lg text-[13px] font-medium hover:bg-cyan-700 transition-colors"
          >
            + New WFH Request
          </button>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
            <h3 className="text-[15px] font-semibold text-slate-900 mb-4">New WFH Request</h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Request Date</label>
                <input
                  type="date"
                  value={formData.requestDate}
                  onChange={(e) => setFormData({ ...formData, requestDate: e.target.value })}
                  min={tomorrowKey}
                  max={maxSelectable}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  required
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Future dates only, up to 3 months ahead.
                </p>
              </div>

              {/* Week-off / holiday note: that date- class tells the employee
                  the work is compensable, and shows the comp-off credit they
                  have on hand to apply it against. */}
              {dayInfo && (dayInfo.isWeekend || dayInfo.holiday) && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800">
                  <p className="font-medium">
                    {dayInfo.holiday ? `This date is a company holiday (${dayInfo.holiday.name})` : 'This date falls on a week off'}
                    {dayInfo.holiday && dayInfo.isWeekend ? ' and a week off' : ''}.
                  </p>
                  <p className="mt-0.5">
                    Working this day can earn a comp-off credit (FIFO, valid 3 months).
                    {compOffAvailable !== null && ` You currently have ${compOffAvailable} comp-off day(s) available to apply.`}
                  </p>
                </div>
              )}
              <div className="mb-4">
                <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Reason</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="Briefly explain why you need to work from home"
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-[13px] font-medium hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-[13px] font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Requests List */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-[15px] font-semibold text-slate-900">My WFH Requests</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No WFH requests yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {requests.map((req) => (
                <div key={req.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{formatDate(req.requestDate)}</p>
                    <p className="text-[13px] text-slate-500 mt-1 line-clamp-1">{req.reason}</p>
                    <div className="mt-2">{getStatusBadge(req.status)}</div>
                  </div>
                  {req.status === 'PENDING' && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      className="text-[13px] text-red-600 hover:text-red-700 font-medium"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
