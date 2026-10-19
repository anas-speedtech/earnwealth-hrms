import { useState, useEffect, useMemo } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveRequestItem } from '../../services/leave.service';
import toast from 'react-hot-toast';

type Tab = 'pending' | 'all';

export default function HrLeaveApprovalsPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [pendingRequests, setPendingRequests] = useState<LeaveRequestItem[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);

  const fetchPending = async () => {
    try {
      const data = await leaveService.getPendingRequests();
      setPendingRequests(data);
    } catch {
      // ignore
    }
  };

  const fetchAll = async () => {
    try {
      const data = await leaveService.getAllRequests({ page: 1 });
      setAllRequests(data.requests);
    } catch {
      // ignore
    }
  };

  const fetchData = async () => {
    setLoading(true);
    if (activeTab === 'pending') {
      await fetchPending();
    } else {
      await fetchAll();
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleApprove = async (requestId: string) => {
    setSubmitting(requestId);
    try {
      await leaveService.approveRequest(requestId);
      toast.success('Leave request approved.');
      fetchData();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to approve.';
      toast.error(message);
    } finally {
      setSubmitting(null);
      setShowRejectFor(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!rejectComment.trim()) {
      toast.error('Please provide a rejection reason.');
      return;
    }
    setSubmitting(requestId);
    try {
      await leaveService.rejectRequest(requestId, rejectComment);
      toast.success('Leave request rejected.');
      setShowRejectFor(null);
      setRejectComment('');
      fetchData();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to reject.';
      toast.error(message);
    } finally {
      setSubmitting(null);
    }
  };

  const displayRequests = useMemo(() => {
    if (activeTab === 'pending') return pendingRequests;
    return allRequests;
  }, [activeTab, pendingRequests, allRequests]);

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
      role="HR_ADMIN"
      userName={(user?.profile?.firstName && user?.profile?.lastName)
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : user?.email || 'HR_ADMIN'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Leave Approvals" subtitle="Review and manage leave requests" />
      <div className="p-8 max-w-5xl">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'pending'
                ? 'bg-yellow-100 text-yellow-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Pending ({pendingRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'all'
                ? 'bg-primary-100 text-primary-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Requests
          </button>
        </div>

        {/* Requests */}
        <div className="bg-white rounded-xl border border-slate-200">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : displayRequests.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {activeTab === 'pending' ? 'No pending leave requests.' : 'No leave requests found.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {displayRequests.map((req) => (
                <div key={req.id} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900">{req.employeeName}</span>
                        <span className="text-xs text-slate-400">{req.employeeCode}</span>
                        {statusBadge(req.status)}
                      </div>
                      <p className="text-sm text-slate-600">
                        <span className="font-medium">{req.leaveTypeName}</span>
                        {' — '}
                        {formatDate(req.startDate)} to {formatDate(req.endDate)}
                        {req.isHalfDay && req.halfDayPeriod && (
                          <span className="text-slate-400"> ({req.halfDayPeriod.replace('_', ' ').toLowerCase()})</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{req.totalDays.toFixed(2)} day(s)</p>
                      <p className="text-xs text-slate-500 mt-1 bg-slate-50 px-2 py-1 rounded line-clamp-2">{req.reason}</p>
                      {req.reviewComment && req.status === 'REJECTED' && (
                        <p className="text-xs text-red-600 mt-1">
                          <span className="font-medium">Rejection reason:</span> {req.reviewComment}
                        </p>
                      )}
                    </div>

                    {req.status === 'PENDING' && activeTab === 'pending' && (
                      <div className="flex items-center gap-2 ml-4">
                        {showRejectFor === req.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={rejectComment}
                              onChange={(e) => setRejectComment(e.target.value)}
                              placeholder="Rejection reason (required)"
                              className="px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleReject(req.id)}
                              disabled={submitting === req.id}
                              className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              {submitting === req.id ? '...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => { setShowRejectFor(null); setRejectComment(''); }}
                              className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleApprove(req.id)}
                              disabled={submitting === req.id}
                              className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              {submitting === req.id ? 'Approving...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => setShowRejectFor(req.id)}
                              className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
