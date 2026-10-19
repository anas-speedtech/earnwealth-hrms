import { useState, useEffect } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { wfhService, PendingWFHRequest } from '../../services/wfh.service';
import { correctionService, CorrectionRequest } from '../../services/correction.service';
import toast from 'react-hot-toast';

type Tab = 'WFH' | 'Corrections';

export default function HrWFHPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('WFH');
  const [wfhRequests, setWfhRequests] = useState<PendingWFHRequest[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [reviewForm, setReviewForm] = useState<{ id: string; action: 'approve' | 'reject'; comment: string } | null>(null);

  const fetchPending = async () => {
    setLoading(true);
    try {
      if (activeTab === 'WFH') {
        const data = await wfhService.listPending();
        setWfhRequests(data);
        setCorrections([]);
      } else {
        const data = await correctionService.listPending();
        setCorrections(data);
        setWfhRequests([]);
      }
    } catch {
      toast.error('Failed to load pending items.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, [activeTab]);

  const handleReview = async () => {
    if (!reviewForm) return;
    setReviewing(true);
    try {
      if (activeTab === 'WFH') {
        if (reviewForm.action === 'approve') {
          await wfhService.approve(reviewForm.id, reviewForm.comment);
          toast.success('WFH request approved!');
        } else {
          await wfhService.reject(reviewForm.id, reviewForm.comment);
          toast.success('WFH request rejected.');
        }
      } else {
        if (reviewForm.action === 'approve') {
          await correctionService.approve(reviewForm.id, reviewForm.comment);
          toast.success('Correction approved!');
        } else {
          await correctionService.reject(reviewForm.id, reviewForm.comment);
          toast.success('Correction rejected.');
        }
      }
      setReviewForm(null);
      fetchPending();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Action failed.';
      toast.error(message);
    } finally {
      setReviewing(false);
    }
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <DashboardShell
      role="HR_ADMIN"
      userName={(user?.profile?.fullName as string) || user?.email || 'HR Admin'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Attendance Review" subtitle="Approve WFH requests and attendance corrections" />
      <div className="p-8 max-w-4xl">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('WFH')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'WFH'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            WFH Requests
          </button>
          <button
            onClick={() => setActiveTab('Corrections')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'Corrections'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Attendance Corrections
          </button>
        </div>

        {/* Pending Items */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">
              Pending {activeTab === 'WFH' ? 'WFH Requests' : 'Corrections'}
            </h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : activeTab === 'WFH' ? (
            wfhRequests.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No pending WFH requests.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {wfhRequests.map((req) => (
                  <div key={req.id} className="px-6 py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">
                          {req.employeeName} ({req.employeeCode})
                        </p>
                        <p className="text-sm text-slate-500">{req.employeeEmail}</p>
                        <p className="text-sm font-medium text-slate-700 mt-1">
                          {formatDate(req.requestDate)}
                        </p>
                        <p className="text-sm text-slate-600 mt-2">{req.reason}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => setReviewForm({ id: req.id, action: 'approve', comment: '' })}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setReviewForm({ id: req.id, action: 'reject', comment: '' })}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            corrections.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No pending corrections.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {corrections.map((c) => (
                  <div key={c.id} className="px-6 py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">
                          {c.employeeName} ({c.employeeCode})
                        </p>
                        <p className="text-sm text-slate-500">{c.employeeEmail}</p>
                        <p className="text-sm font-medium text-slate-700 mt-1">
                          {formatDate(c.date)}
                        </p>
                        <p className="text-sm text-slate-600 mt-2">{c.reason}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => setReviewForm({ id: c.id, action: 'approve', comment: '' })}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setReviewForm({ id: c.id, action: 'reject', comment: '' })}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Review Modal */}
        {reviewForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                {reviewForm.action === 'approve' ? 'Approve' : 'Reject'} {activeTab === 'WFH' ? 'WFH Request' : 'Correction'}
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Comment {reviewForm.action === 'reject' && '(required)'}
                </label>
                <textarea
                  value={reviewForm.comment}
                  onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder={reviewForm.action === 'approve' ? 'Optional note...' : 'Please provide a reason for rejection...'}
                  required={reviewForm.action === 'reject'}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReview}
                  disabled={reviewing || (reviewForm.action === 'reject' && !reviewForm.comment)}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors ${
                    reviewForm.action === 'approve'
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {reviewing ? 'Processing...' : reviewForm.action === 'approve' ? 'Approve' : 'Reject'}
                </button>
                <button
                  onClick={() => setReviewForm(null)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
