import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveRequestItem, LeaveBalanceItem } from '../../services/leave.service';
import { wfhService } from '../../services/wfh.service';
import { compoffService } from '../../services/compoff.service';
import { organizationService } from '../../services/organization.service';
import toast from 'react-hot-toast';

type LeavesTab = 'leave-requests' | 'balances' | 'wfh' | 'comp-off';

const TABS: { key: LeavesTab; label: string }[] = [
  { key: 'leave-requests', label: 'Leave Requests' },
  { key: 'balances', label: 'Leave Balances' },
  { key: 'wfh', label: 'WFH' },
  { key: 'comp-off', label: 'Comp-Off' },
];

export default function SuperAdminLeavesPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<LeavesTab>('leave-requests');
  const [pendingRequests, setPendingRequests] = useState<LeaveRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectFor, setRejectFor] = useState<string | null>(null);

  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [balancesLoading, setBalancesLoading] = useState(false);

  const [wfhRequests, setWfhRequests] = useState<unknown[]>([]);
  const [wfhLoading, setWfhLoading] = useState(true);

  const [pendingCredits, setPendingCredits] = useState<unknown[]>([]);
  const [compOffLoading, setCompOffLoading] = useState(true);

  const userRole = user?.role || '';
  const canReviewAll = userRole === 'SUPER_ADMIN' || userRole === 'HR_ADMIN';

  const loadLeaveRequests = async () => {
    try {
      setPendingRequests(await leaveService.getPendingRequests());
    } catch {
      // ignore
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadBalances = async (employeeId: string) => {
    if (!employeeId) {
      setBalances([]);
      return;
    }
    try {
      setBalances(await leaveService.getEmployeeBalances(employeeId));
    } catch {
      setBalances([]);
    } finally {
      setBalancesLoading(false);
    }
  };

  const loadWfh = async () => {
    try {
      const page = await wfhService.listAll(1);
      setWfhRequests(page.requests);
    } catch {
      setWfhRequests([]);
    } finally {
      setWfhLoading(false);
    }
  };

  const loadCompOff = async () => {
    try {
      setPendingCredits(await compoffService.listPendingCredits());
    } catch {
      setPendingCredits([]);
    } finally {
      setCompOffLoading(false);
    }
  };

  useEffect(() => {
    loadLeaveRequests();
  }, []);

  useEffect(() => {
    organizationService
      .getEmployees({ page: 1 })
      .then((page) => {
        const items = (page as unknown as { data: { id: string; name: string }[] }).data;
        setEmployees(items);
        setSelectedEmployeeId((current) => current || items[0]?.id || '');
      });
  }, []);

  useEffect(() => {
    loadBalances(selectedEmployeeId);
  }, [selectedEmployeeId]);

  useEffect(() => {
    loadWfh();
    loadCompOff();
  }, []);

  const handleApproveLeave = async (requestId: string) => {
    setSubmitting(requestId);
    try {
      await leaveService.approveRequest(requestId);
      toast.success('Leave request approved.');
      loadLeaveRequests();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to approve the leave request.'));
    } finally {
      setSubmitting(null);
    }
  };

  const handleRejectLeave = async (requestId: string) => {
    if (!rejectComment.trim()) {
      toast.error('Please provide a reason for rejection.');
      return;
    }
    setSubmitting(requestId);
    try {
      await leaveService.rejectRequest(requestId, rejectComment);
      toast.success('Leave request rejected.');
      loadLeaveRequests();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to reject the leave request.'));
    } finally {
      setSubmitting(null);
    }
  };

  const handleApproveWfh = async (requestId: string) => {
    setSubmitting(requestId);
    try {
      await wfhService.approve(requestId, '');
      toast.success('WFH request approved.');
      loadWfh();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to approve the WFH request.'));
    } finally {
      setSubmitting(null);
    }
  };

  const handleRejectWfh = async (requestId: string) => {
    if (!rejectComment.trim()) {
      toast.error('Please provide a reason for rejection.');
      return;
    }
    setSubmitting(requestId);
    try {
      await wfhService.reject(requestId, rejectComment);
      toast.success('WFH request rejected.');
      loadWfh();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to reject the WFH request.'));
    } finally {
      setSubmitting(null);
    }
  };

  const handleApproveCredit = async (creditId: number, action: 'APPROVE' | 'REJECT') => {
    const reason = action === 'REJECT' ? rejectComment : '';
    setSubmitting(String(creditId));
    try {
      await compoffService.reviewCredit(creditId, action, reason);
      toast.success(
        action === 'APPROVE' ? 'Comp-off credit approved.' : 'Comp-off credit rejected.',
      );
      loadCompOff();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to review the comp-off credit.'));
    } finally {
      setSubmitting(null);
    }
  };

  const totals = computeTotals(balances);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  return (
    <DashboardShell
      role="SUPER_ADMIN"
      userName={displayName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Leaves" subtitle="Leave requests, balances, WFH and comp-off" />
      <div className="p-8 max-w-6xl">
        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'leave-requests' && (
          <section>
            {requestsLoading ? (
              <p className="text-slate-500">Loading leave requests…</p>
            ) : (
              <>
                <h3 className="mb-3 text-base font-semibold text-slate-700">Pending requests</h3>
                {pendingRequests.length === 0 ? (
                  <p className="text-slate-500">No pending leave requests.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((request) => (
                      <div key={request.id} className="rounded-xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-wrap justify-between gap-2">
                          <p className="font-medium text-slate-800">
                            {request.leaveTypeName} — {request.startDate} to {request.endDate}
                          </p>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{request.status}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{request.reason}</p>
                        {canReviewAll && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              onClick={() => handleApproveLeave(request.id)}
                              disabled={submitting === request.id}
                              className="px-3 py-1 rounded-lg bg-primary-600 text-white text-sm disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectFor(rejectFor === request.id ? null : request.id)}
                              className="px-3 py-1 rounded-lg border border-slate-300 text-sm text-slate-700"
                            >
                              Reject
                            </button>
                            {rejectFor === request.id && (
                              <textarea
                                className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                rows={2}
                                value={rejectComment}
                                onChange={(event) => setRejectComment(event.target.value)}
                                placeholder="Reason for rejection (required)"
                              />
                            )}
                            {rejectFor === request.id && (
                              <button
                                onClick={() => handleRejectLeave(request.id)}
                                disabled={submitting === request.id}
                                className="px-3 py-1 rounded-lg bg-primary-600 text-white text-sm disabled:opacity-50"
                              >
                                Confirm rejection
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === 'balances' && (
          <section>
            <h3 className="mb-3 text-base font-semibold text-slate-700">Leave balances</h3>
            <div className="mb-4 max-w-xs">
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>
            {balancesLoading || balances.length === 0 ? (
              <p className="text-slate-500">No balances available.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Leave type</th>
                      <th className="px-3 py-2 text-right">Used</th>
                      <th className="px-3 py-2 text-right">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((row) => (
                      <tr key={row.code || row.leaveTypeId} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{row.displayName || row.name}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{row.usedBalance}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-800">{row.availableBalance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-sm text-slate-600">
                  Total regular leave: {totals.totalRemaining} days remaining.
                </p>
              </>
            )}
          </section>
        )}

        {activeTab === 'wfh' && (
          <section>
            {wfhLoading ? (
              <p className="text-slate-500">Loading WFH requests…</p>
            ) : (
              <>
                <h3 className="mb-3 text-base font-semibold text-slate-700">All WFH requests</h3>
                {wfhRequests.length === 0 ? (
                  <p className="text-slate-500">No WFH requests.</p>
                ) : (
                  <div className="space-y-3">
                    {wfhRequests.map((request) => {
                      const item = request as {
                        id: string;
                        employeeName?: string;
                        startDate: string;
                        endDate: string;
                        reason: string;
                        status: string;
                      };
                      return (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-wrap justify-between gap-2">
                            <p className="font-medium text-slate-800">
                              {item.employeeName} — {item.startDate} to {item.endDate}
                            </p>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{item.status}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{item.reason}</p>
                          {canReviewAll && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => handleApproveWfh(item.id)}
                                disabled={submitting === item.id}
                                className="px-3 py-1 rounded-lg bg-primary-600 text-white text-sm disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectFor(rejectFor === item.id ? null : item.id)}
                                className="px-3 py-1 rounded-lg border border-slate-300 text-sm text-slate-700"
                              >
                                Reject
                              </button>
                              {rejectFor === item.id && (
                                <textarea
                                  className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                  rows={2}
                                  value={rejectComment}
                                  onChange={(event) => setRejectComment(event.target.value)}
                                  placeholder="Reason for rejection (required)"
                                />
                              )}
                              {rejectFor === item.id && (
                                <button
                                  onClick={() => handleRejectWfh(item.id)}
                                  disabled={submitting === item.id}
                                  className="px-3 py-1 rounded-lg bg-primary-600 text-white text-sm disabled:opacity-50"
                                >
                                  Confirm rejection
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === 'comp-off' && (
          <section>
            {compOffLoading ? (
              <p className="text-slate-500">Loading comp-off credits…</p>
            ) : (
              <>
                <h3 className="mb-3 text-base font-semibold text-slate-700">Pending comp-off credits</h3>
                {pendingCredits.length === 0 ? (
                  <p className="text-slate-500">No pending comp-off credits.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingCredits.map((credit) => {
                      const item = credit as { id: number; employeeName?: string; sourceDate: string };
                      return (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-wrap justify-between gap-2">
                            <p className="font-medium text-slate-800">
                              {item.employeeName || 'Employee'} — from {item.sourceDate}
                            </p>
                          </div>
                          <button
                            onClick={() => handleApproveCredit(item.id, 'APPROVE')}
                            disabled={submitting === String(item.id)}
                            className="mt-3 px-3 py-1 rounded-lg bg-primary-600 text-white text-sm disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectFor(rejectFor === String(item.id) ? null : String(item.id))}
                            className="mt-3 px-3 py-1 rounded-lg border border-slate-300 text-sm text-slate-700"
                          >
                            Reject
                          </button>
                          {rejectFor === String(item.id) && (
                            <textarea
                              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              rows={2}
                              value={rejectComment}
                              onChange={(event) => setRejectComment(event.target.value)}
                              placeholder="Reason for rejection (required)"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}

function computeTotals(balances: LeaveBalanceItem[]) {
  let used = 0;
  let available = 0;
  for (const row of balances) {
    used += row.usedBalance;
    available += row.availableBalance;
  }
  return { totalUsed: used, totalRemaining: available };
}

function errorMessage(err: unknown, fallback: string) {
  const response = (err as { response?: { data?: { error?: { message?: string } } } })?.response;
  return response?.data?.error?.message || fallback;
}
