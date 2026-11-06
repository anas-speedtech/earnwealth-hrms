import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarX2 } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveTile, LeaveTileRequest } from '../../services/leave.service';
import StatusBadge from '../../components/shared/StatusBadge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const CARD =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';

const SELECT =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10';

type SubTab = 'tiles' | 'requests' | 'balances';

/** Maps a leave request status to a badge tone. */
function statusTone(status: string): 'emerald' | 'red' | 'amber' {
  if (status === 'APPROVED') return 'emerald';
  if (status === 'REJECTED') return 'red';
  return 'amber';
}

/**
 * The "Leaves" left-side submenu lands here. It gives the HR Admin a broad
 * view: a tile per leave type showing how many days are on leave this month
 * (or for the selected day), and clicking a tile drills down to the
 * individual requests behind it.
 */
export default function LeavesHubPage() {
  const { user, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const subTab = (params.get('tab') as SubTab) || 'tiles';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  // 0 = whole month; otherwise a specific day number.
  const [day, setDay] = useState(0);
  const [tiles, setTiles] = useState<LeaveTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTile, setOpenTile] = useState<LeaveTile | null>(null);

  const switchTab = (tab: SubTab) => {
    const next = new URLSearchParams(params);
    if (tab === 'tiles') next.delete('tab');
    else next.set('tab', tab);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    leaveService
      .getTiles({ year, month, day: day || undefined })
      .then((data) => { if (mounted) setTiles(data.tiles); })
      .catch(() => { if (mounted) setError('Could not load leave tiles.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [year, month, day]);

  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);

  const displayName = user?.profile?.fullName ? (user.profile.fullName as string) : user?.email || 'HR Admin';

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Leaves" subtitle="Leave overview by type with drill-down to individual requests" />
      <div className="p-6 max-w-6xl">
        {/* sub-menu — segmented control */}
        <div className="mb-5 inline-flex rounded-xl bg-slate-100 p-1">
          {([['tiles', 'Overview'], ['requests', 'All Requests'], ['balances', 'Balances']] as [SubTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition ${
                subTab === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {subTab === 'tiles' && (
          <div>
            {/* period selector */}
            <div className={`mb-5 grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 ${CARD}`}>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Month</label>
                <select
                  value={month}
                  onChange={(e) => { setMonth(Number(e.target.value)); setDay(0); }}
                  className={SELECT}
                >
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className={SELECT}
                >
                  {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Day (optional)</label>
                <select
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                  className={SELECT}
                >
                  <option value={0}>Whole month</option>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-600/10 ring-1 ring-inset ring-red-100">{error}</p>}

            {loading ? (
              <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
                <Spinner size="md" />
                Loading tiles…
              </div>
            ) : tiles.length === 0 ? (
              <div className={CARD}>
                <EmptyState
                  icon={<CalendarX2 size={20} />}
                  title="Nothing to show"
                  description={`No leaves recorded for the selected ${day ? 'day' : 'month'}.`}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tiles.map((tile) => {
                  const isOpen = openTile?.key === tile.key;
                  return (
                    <button
                      key={tile.key}
                      onClick={() => setOpenTile(openTile?.key === tile.key ? null : tile)}
                      className={`rounded-2xl border bg-white p-4 text-left transition ${
                        isOpen
                          ? 'border-cyan-300 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)] ring-2 ring-cyan-100'
                          : 'border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)] hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[13px] font-semibold text-slate-900">{tile.name}</span>
                        <StatusBadge tone="slate">{tile.code}</StatusBadge>
                      </div>

                      <div className="mt-3 flex items-end gap-2">
                        <span className="text-[26px] font-bold leading-none tracking-tight text-cyan-700">{tile.total}</span>
                        <span className="pb-0.5 text-xs text-slate-400">
                          leave{tile.total === 1 ? '' : 's'} {day ? 'on this day' : 'this month'}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <StatusBadge tone="amber" dot>{`Pending ${tile.pending}`}</StatusBadge>
                        <StatusBadge tone="emerald" dot>{`Approved ${tile.approved}`}</StatusBadge>
                        <StatusBadge tone="red" dot>{`Rejected ${tile.rejected}`}</StatusBadge>
                      </div>

                      {isOpen && (
                        <div className="mt-4 border-t border-slate-100 pt-3 text-left">
                          <p className="mb-2 text-xs font-medium text-slate-600">Drill-down — individual requests</p>
                          {tile.requests.length === 0 ? (
                            <p className="text-xs text-slate-400">No requests.</p>
                          ) : (
                            <ul className="space-y-2">
                              {tile.requests.map((r) => (
                                <DrillRow key={r.id} request={r} />
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {subTab === 'requests' && <AllRequestsPane />}
        {subTab === 'balances' && <BalancesPane />}
      </div>
    </DashboardShell>
  );
}

function DrillRow({ request }: { request: LeaveTileRequest }) {
  const start = new Date(request.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const end = new Date(request.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return (
    <li className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-700">
          {request.employeeName || request.employeeCode || 'Unknown'}
        </span>
        <StatusBadge tone={statusTone(request.status)}>{request.status}</StatusBadge>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{start} → {end}</p>
    </li>
  );
}

// ---- All Requests pane (broad list, reusable) ----
function AllRequestsPane() {
  const [rows, setRows] = useState<LeaveTileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let mounted = true;
    leaveService
      .getAllRequests({ page: 1 })
      .then((res) => { if (mounted) setRows(res.requests as unknown as LeaveTileRequest[]); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
        <Spinner size="md" />
        Loading requests…
      </div>
    );
  if (rows.length === 0)
    return (
      <div className={CARD}>
        <EmptyState icon={<CalendarX2 size={20} />} title="No leave requests" description="Nothing has been requested yet." />
      </div>
    );
  return (
    <div className={`overflow-x-auto ${CARD}`}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50/60 text-left">
          <tr>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employee</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Type</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Dates</th>
            <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 text-[13px] transition hover:bg-slate-50/60">
              <td className="px-4 py-3 font-medium text-slate-700">{r.employeeName || r.employeeCode || '—'}</td>
              <td className="px-4 py-3 text-slate-600">{r.leaveTypeName || r.type || '—'}</td>
              <td className="px-4 py-3 text-slate-600">
                {new Date(r.startDate).toLocaleDateString('en-IN')} → {new Date(r.endDate).toLocaleDateString('en-IN')}
              </td>
              <td className="px-4 py-3">
                <StatusBadge tone={statusTone(r.status)}>{r.status}</StatusBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Balances pane (reuse existing balances view) ----
function BalancesPane() {
  const [employeeId, setEmployeeId] = useState('');
  const [balances, setBalances] = useState<unknown[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import('../../services/organization.service').then(({ organizationService }) => {
      organizationService.getEmployees({ page: 1 }).then((page) => {
        const items = (page.data || []) as unknown as { id: string; firstName?: string; lastName?: string; name?: string }[];
        setEmployees(items.map((e) => ({ id: e.id, name: (e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : e.name || 'Unknown') })));
        setEmployeeId((cur) => cur || items[0]?.id || '');
      }).catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    leaveService.getEmployeeBalances(employeeId).then(setBalances).catch(() => setBalances([]));
    setLoading(false);
  }, [employeeId]);

  return (
    <div>
      <div className={`mb-4 max-w-xs p-4 ${CARD}`}>
        <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Employee</label>
        <select className={SELECT} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
          <Spinner size="md" />
          Loading balances…
        </div>
      ) : (balances as { displayName?: string; name?: string; availableBalance?: number | string; usedBalance?: number | string }[]).length === 0 ? (
        <div className={CARD}>
          <EmptyState icon={<CalendarX2 size={20} />} title="No balances available" description="This employee has no leave balances recorded." />
        </div>
      ) : (
        <div className={`overflow-x-auto ${CARD}`}>
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 text-left">
              <tr>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Leave type</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Used</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Available</th>
              </tr>
            </thead>
            <tbody>
              {(balances as { displayName?: string; name?: string; availableBalance?: number | string; usedBalance?: number | string }[]).map((b, i) => (
                <tr key={i} className="border-t border-slate-100 transition hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-700">{b.displayName || b.name}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{b.usedBalance}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{b.availableBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
