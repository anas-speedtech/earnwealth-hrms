import { useState, useEffect } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveRequestItem } from '../../services/leave.service';
import toast from 'react-hot-toast';

export default function EmployeeLeaveRequestsPage() {
  const { user, logout } = useAuth();
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchRequests = async (pageNum: number) => {
    setLoading(true);
    try {
      const data = await leaveService.getMyRequests(pageNum, filter || undefined);
      setRequests(data.requests);
      setTotalPages((data.pagination as { pages: number }).pages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests(page);
  }, [page]);

  const handleFilter = (newFilter: string) => {
    setFilter(newFilter);
    setPage(1);
  };

  useEffect(() => {
    if (filter) fetchRequests(1);
  }, [filter]);

  const handleCancel = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this leave request?')) return;
    try {
      await leaveService.cancelRequest(requestId);
      toast.success('Leave request cancelled.');
      fetchRequests(page);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to cancel.';
      toast.error(message);
    }
  };

  const statusBadge = (status: string) => {
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
      <Header title="My Leave Requests" subtitle="View and manage your leave applications" />
      <div className="p-8 max-w-4xl">
        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {['', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
              <button
                key={s}
                onClick={() => handleFilter(s)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === s ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Requests List */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Leave History</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No leave requests found.</div>
          ) : (
            <>
              <div className="divide-y divide-slate-200">
                {requests.map((req) => (
                  <div key={req.id} className="px-6 py-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900">{req.leaveTypeName || req.type || 'Leave'}</span>
                          {statusBadge(req.status)}
                        </div>
                        <p className="text-sm text-slate-600">
                          {formatDate(req.startDate)} — {formatDate(req.endDate)}
                          {req.isHalfDay && req.halfDayPeriod && (
                            <span className="text-slate-400 ml-1">({req.halfDayPeriod.replace('_', ' ').toLowerCase()})</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {req.totalDays.toFixed(2)} day(s)
                          {req.reason && ` — ${req.reason}`}
                        </p>
                        {req.reviewComment && (
                          <p className="text-xs text-slate-500 mt-1 bg-slate-50 px-2 py-1 rounded mt-2">
                            <span className="font-medium">Review:</span> {req.reviewComment}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {req.status === 'PENDING' && (
                          <button
                            onClick={() => handleCancel(req.id)}
                            className="text-sm text-red-600 hover:text-red-700 font-medium"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
