import { useEffect, useState } from 'react';
import { CalendarX2, Inbox } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveRequestItem, LeaveBalanceItem } from '../../services/leave.service';
import { wfhService, WFHRequest } from '../../services/wfh.service';
import { compoffService, CompOffCreditItem } from '../../services/compoff.service';
import { formatISTDay } from '../../utils/dates';
import { organizationService } from '../../services/organization.service';
import StatusBadge, { StatusBadgeTone } from '../../components/shared/StatusBadge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import toast from 'react-hot-toast';

type LeavesTab = 'leave-requests' | 'balances' | 'wfh' | 'comp-off';

const TABS: { key: LeavesTab; label: string }[] = [
  { key: 'leave-requests', label: 'Leave Requests' },
  { key: 'balances', label: 'Leave Balances' },
  { key: 'wfh', label: 'WFH' },
  { key: 'comp-off', label: 'Comp-Off' },
];

const CARD =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';

export default function HrLeavesPage() {
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

  type WfhRow = WFHRequest & { employeeName?: string; startDate?: string; endDate?: string };
  const [wfhRequests, setWfhRequests] = useState<WfhRow[]>([]);
  const [wfhLoading, setWfhLoading] = useState(true);

  const [pendingCredits, setPendingCredits] = useState<CompOffCreditItem[]>([]);
  const [compOffLoading, setCompOffLoading] = useState(true);

  const userRole = user?.role || '';

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
        const items = (page as unknown as { data: { id: string; firstName: string; lastName: string }[] }).data;
        setEmployees(items.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() })));
        setSelectedEmployeeId((current) => current || items[0]?.id || '');
      })
      .catch(() => {
        // ignore
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
      toast.success(action === 'APPROVE' ? 'Comp-off credit approved.' : 'Comp-off credit rejected.');
      loadCompOff();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to review the comp-off credit.'));
    } finally {
      setSubmitting(null);
    }
  };

  // Filter to only the three regular leave types: PL, CL, EL
  const REGULAR_LEAVE_CODES = ['PL', 'CL', 'EL'];
  const regularBalances = balances.filter((b) => REGULAR_LEAVE_CODES.includes(b.code));
  const totals = computeTotals(regularBalances);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'HR Admin';

  return (
    <DashboardShell
      role="HR_ADMIN"
      userName={displayName}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Leaves" subtitle="Leave requests, balances, WFH and comp-off" />
      <div className="p-6 max-w-6xl">
        {/* segmented tab control */}
        <div className="mb-5 inline-flex rounded-xl bg-slate-100 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${
                activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'leave-requests' && (
          <section>
            {requestsLoading ? (
              <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
                <Spinner size="md" />
                Loading requests…
              </div>
            ) : (
              <>
                <h3 className="mb-3 text-[15px] font-bold tracking-tight text-slate-900">Pending requests</h3>
                {pendingRequests.length === 0 ? (
                  <div className={CARD}>
                    <EmptyState icon={<Inbox size={20} />} title="No pending leave requests" description="Everything is caught up — nothing is waiting on review." />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingRequests.map((request) => (
                      <div key={request.id} className={`p-4 ${CARD}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-slate-800">
                              {request.leaveTypeName || request.type} — {formatISTDay(request.startDate)} to {formatISTDay(request.endDate)}
                            </p>
                            {request.employeeName && (
                              <p className="mt-0.5 text-xs text-slate-500">{request.employeeName}</p>
                            )}
                          </div>
                          <StatusBadge tone="amber" dot>{request.status}</StatusBadge>
                        </div>
                        {request.reason && <p className="mt-1.5 text-[13px] text-slate-600">{request.reason}</p>}
                        {userRole !== 'SUPER_ADMIN' && (
                          <div className="mt-3 flex flex-wrap items-start gap-2">
                            <Button size="sm" onClick={() => handleApproveLeave(request.id)} disabled={submitting === request.id} isLoading={submitting === request.id}>
                              Approve
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setRejectFor(rejectFor === request.id ? null : request.id)}>
                              Reject
                            </Button>
                            {rejectFor === request.id && (
                              <textarea
                                className="h-fit w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
                                rows={2}
                                value={rejectComment}
                                onChange={(event) => setRejectComment(event.target.value)}
                                placeholder="Reason for rejection (required)"
                              />
                            )}
                            {rejectFor === request.id && (
                              <Button variant="danger" size="sm" onClick={() => handleRejectLeave(request.id)} disabled={submitting === request.id}>
                                Confirm rejection
                              </Button>
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
            <div className="mb-4 max-w-xs">
              <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Employee</label>
              <select
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
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
            {balancesLoading ? (
              <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
                <Spinner size="md" />
                Loading balances…
              </div>
            ) : regularBalances.length === 0 ? (
              <div className={CARD}>
                <EmptyState icon={<CalendarX2 size={20} />} title="No balances available" description="This employee has no leave balances recorded." />
              </div>
            ) : (
              <>
                <div className={`overflow-hidden ${CARD}`}>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50/60 text-left">
                      <tr>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Leave type</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Allocated</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Used</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regularBalances.map((row) => (
                        <tr key={row.code || row.leaveTypeId} className="border-t border-slate-100 transition hover:bg-slate-50/60">
                          <td className="px-4 py-3 text-slate-700">{row.displayName || row.name}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{Number(row.openingBalance || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">{row.usedBalance}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{row.availableBalance}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                        <td className="px-4 py-3 text-slate-700">Total (PL / CL / EL)</td>
                        <td className="px-4 py-3 text-right text-slate-900">{totals.totalAllocated.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-slate-900">{totals.totalUsed.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-slate-900">{totals.totalRemaining.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Totals cover regular leave types (PL, CL, EL) only. Comp-Off credits are tracked separately under Comp-Off and
                  WFH does not affect leave balances.
                </p>
              </>
            )}
          </section>
        )}

        {activeTab === 'wfh' && (
          <section>
            {wfhLoading ? (
              <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
                <Spinner size="md" />
                Loading WFH requests…
              </div>
            ) : (
              <>
                <h3 className="mb-3 text-[15px] font-bold tracking-tight text-slate-900">All WFH requests</h3>
                {wfhRequests.length === 0 ? (
                  <div className={CARD}>
                    <EmptyState icon={<Inbox size={20} />} title="No WFH requests" description="Nothing has been requested yet." />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {wfhRequests.map((item) => {
                      // WFH requests are single-day: show the request day
                      // (ISO-normalized), or a range if the backend ever returns one.
                      const range = item.startDate && item.endDate
                        ? ` — ${formatISTDay(item.startDate)} to ${formatISTDay(item.endDate)}`
                        : item.requestDate ? ` — ${formatISTDay(item.requestDate)}` : '';
                      return (
                        <div key={item.id} className={`p-4 ${CARD}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-slate-800">
                                {item.employeeName || 'Employee'}{range}
                              </p>
                            </div>
                            <StatusBadge tone={statusTone(item.status)} dot>{item.status}</StatusBadge>
                          </div>
                          <p className="mt-1 text-[13px] text-slate-600">{item.reason}</p>
                          {userRole !== 'SUPER_ADMIN' && (
                            <div className="mt-3 flex flex-wrap items-start gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApproveWfh(item.id)}
                                disabled={submitting === item.id}
                                isLoading={submitting === item.id}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                  setRejectFor(rejectFor === item.id ? null : item.id)
                                }
                              >
                                Reject
                              </Button>
                              {rejectFor === item.id && (
                                <textarea
                                  className="h-fit w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
                                  rows={2}
                                  value={rejectComment}
                                  onChange={(event) => setRejectComment(event.target.value)}
                                  placeholder="Reason for rejection (required)"
                                />
                              )}
                              {rejectFor === item.id && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleRejectWfh(item.id)}
                                  disabled={submitting === item.id}
                                >
                                  Confirm rejection
                                </Button>
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
              <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
                <Spinner size="md" />
                Loading comp-off credits…
              </div>
            ) : (
              <>
                <h3 className="mb-3 text-[15px] font-bold tracking-tight text-slate-900">Pending comp-off credits</h3>
                {pendingCredits.length === 0 ? (
                  <div className={CARD}>
                    <EmptyState icon={<Inbox size={20} />} title="No pending comp-off credits" description="Nothing is waiting on review." />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingCredits.map((credit) => (
                      <div key={credit.id} className={`p-4 ${CARD}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-slate-800">
                              {credit.employeeName || 'Employee'} — from {formatISTDay(String(credit.sourceDate))}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {credit.earnedDays} earned · {credit.usedDays} used · {credit.remaining} remaining
                            </p>
                          </div>
                          <StatusBadge tone="amber" dot>Pending</StatusBadge>
                        </div>
                        <div className="mt-3">
                          <Button
                            size="sm"
                            onClick={() => handleApproveCredit(credit.id, 'APPROVE')}
                            disabled={submitting === String(credit.id)}
                            isLoading={submitting === String(credit.id)}
                          >
                            Approve
                          </Button>
                        </div>
                      </div>
                    ))}
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
  // Balance figures are MySQL DECIMALs that arrive as strings — coerce every
  // column or `+=` concatenates text ("5.00" + "3.00" -> "5.003.00").
  let allocated = 0;
  let used = 0;
  let available = 0;
  for (const row of balances) {
    allocated += Number(row.openingBalance || 0);
    used += Number(row.usedBalance || 0);
    available += Number(row.availableBalance || 0);
  }
  return { totalAllocated: allocated, totalUsed: used, totalRemaining: available };
}

function statusTone(status: string): StatusBadgeTone {
  const s = status.toUpperCase();
  if (s === 'APPROVED' || s === 'ACTIVE') return 'emerald';
  if (s === 'REJECTED' || s === 'CANCELLED') return 'red';
  if (s === 'PENDING' || s === 'ON HOLD') return 'amber';
  return 'slate';
}

function errorMessage(err: unknown, fallback: string) {
  const response = (err as { response?: { data?: { error?: { message?: string } } } })?.response;
  return response?.data?.error?.message || fallback;
}
