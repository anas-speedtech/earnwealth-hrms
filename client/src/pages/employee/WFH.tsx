import { useState, useEffect } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { wfhService, WFHRequest } from '../../services/wfh.service';
import toast from 'react-hot-toast';

export default function EmployeeWFHPage() {
  const { user, logout } = useAuth();
  const [requests, setRequests] = useState<WFHRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ requestDate: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

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
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.requestDate || !formData.reason) {
      toast.error('Please fill in all fields.');
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
      APPROVED: 'bg-green-100 text-green-700',
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
            className="mb-6 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            + New WFH Request
          </button>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">New WFH Request</h3>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Request Date</label>
                <input
                  type="date"
                  value={formData.requestDate}
                  onChange={(e) => setFormData({ ...formData, requestDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Briefly explain why you need to work from home"
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
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
            <h3 className="text-lg font-semibold text-slate-900">My WFH Requests</h3>
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
                    <p className="text-sm text-slate-500 mt-1 line-clamp-1">{req.reason}</p>
                    <div className="mt-2">{getStatusBadge(req.status)}</div>
                  </div>
                  {req.status === 'PENDING' && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
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
