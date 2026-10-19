import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { compoffService, CompOffCreditItem, CompOffLeaveRequest } from '../../services/compoff.service';
import toast from 'react-hot-toast';

export default function HrCompOffPage() {
  const { user, logout } = useAuth();
  const [pendingCredits, setPendingCredits] = useState<CompOffCreditItem[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<CompOffLeaveRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ kind: 'credit' | 'leave'; id: number; approve: boolean } | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      compoffService.listPendingCredits().catch(() => []),
      compoffService.listPendingCompOffLeaves().catch(() => []),
    ])
      .then(([credits, leaves]) => {
        if (!mounted) return;
        setPendingCredits(credits);
        setPendingLeaves(leaves);
      })
      .catch(() => {
        if (mounted) setError('Could not load the comp-off queues.');
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReview = async () => {
    if (!reviewTarget) return;
    setIsSubmitting(`${reviewTarget.kind}-${reviewTarget.id}`);
    try {
      if (reviewTarget.kind === 'credit') {
        await compoffService.reviewCredit(
          reviewTarget.id,
          reviewTarget.approve ? 'APPROVE' : 'REJECT',
          reviewComment,
        );
      } else {
        await compoffService.reviewCompOffLeave(
          reviewTarget.id,
          reviewTarget.approve ? 'APPROVE' : 'REJECT',
          reviewComment,
        );
      }
      toast.success('Review submitted.');
      setReviewTarget(null);
      setReviewComment('');
      const queues = await Promise.all([
        compoffService.listPendingCredits(),
        compoffService.listPendingCompOffLeaves(),
      ]);
      setPendingCredits(queues[0]);
      setPendingLeaves(queues[1]);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
        ?.message;
      toast.error(message || 'Review failed.');
    } finally {
      setIsSubmitting(null);
    }
  };

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'HR_ADMIN';

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Comp-Off" subtitle="Review comp-off credits and redeemed days" />
      <div className="p-8 max-w-6xl">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <section className="mb-8">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Pending credit reviews</h3>
          {pendingCredits.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              No comp-off credits waiting for review.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-500">Employee</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Source date</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Days</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingCredits.map((credit) => (
                    <tr key={credit.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {credit.employeeName || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{credit.sourceDate}</td>
                      <td className="px-4 py-3 text-slate-600">{credit.earnedDays}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Pending</span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setReviewTarget({ kind: 'credit', id: credit.id, approve: true });
                            setReviewComment('');
                          }}
                          className="mr-2 rounded-lg border border-green-300 px-3 py-1 text-xs text-green-700 hover:bg-green-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setReviewTarget({ kind: 'credit', id: credit.id, approve: false });
                            setReviewComment('');
                          }}
                          className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-8">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Pending comp-off leave requests</h3>
          {pendingLeaves.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              No redeemed-days leave waiting for review.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-500">Employee</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Period</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Reason</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLeaves.map((leave) => (
                    <tr key={leave.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {leave.employeeName || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {leave.startDate} → {leave.endDate}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{leave.reason || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setReviewTarget({ kind: 'leave', id: leave.id, approve: true });
                            setReviewComment('');
                          }}
                          className="mr-2 rounded-lg border border-green-300 px-3 py-1 text-xs text-green-700 hover:bg-green-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setReviewTarget({ kind: 'leave', id: leave.id, approve: false });
                            setReviewComment('');
                          }}
                          className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {reviewTarget && (
          <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-slate-900">
              {reviewTarget.kind === 'credit' ? 'Review credit' : 'Review leave request'}
            </h3>
            <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="comment">
              Review comment (optional)
            </label>
            <textarea
              id="comment"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={3}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
            />
            <button
              onClick={handleReview}
              disabled={isSubmitting !== null}
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
