import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceService } from '../../services/attendance.service';
import { holidayService } from '../../services/holiday.service';
import { dashboardService, DashSummary } from '../../services/dashboard.service';
import {
  Panel,
  StatGrid,
  TitledStat,
  AttendanceList,
  HolidayList,
  QuickActions,
  ViewAll,
} from '../../components/dashboard/widgets';

interface HistoryRow {
  day: string;
  status: 'Present' | 'Absent' | 'Late' | 'WFH';
  time: string;
}

export default function EmployeeDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [holidays, setHolidays] = useState<{ date: string; name: string }[]>([]);
  const { data, loading, error } = useDashboard();

  const stats = useMemo(() => toTitledStats(data), [data]);

  useEffect(() => {
    let mounted = true;

    attendanceService
      .getMyHistory(1)
      .then((result) => {
        if (!mounted) return;
        setHistory(
          result.records.map((record) => {
            const session = record.sessions[0];
            const punchIn = session?.punchIn ? formatTime(session.punchIn) : '—';
            const punchOut = session?.punchOut ? formatTime(session.punchOut) : '—';
            return {
              day: formatDay(record.date),
              status: toDayStatus(record.status),
              time: `${punchIn} – ${punchOut}`,
            };
          }),
        );
      })
      .catch(() => {
        // leave the panel empty
      });

    holidayService
      .list()
      .then((rows) => {
        if (!mounted) return;
        setHolidays(rows.slice(-5).reverse());
      })
      .catch(() => {
        // leave the panel empty
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Employee';

  const isPresentToday = stats.find((s) => s.key === 'punch')?.value === 1;

  return (
    <DashboardShell role="EMPLOYEE" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Employee Dashboard" />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="mb-6 text-sm text-slate-500">Your self-service portal.</p>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-6">
          <StatGrid stats={stats} loading={loading} />

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel
              title="My Attendance"
              action={<ViewAll to="/employee/attendance" />}
              className="lg:col-span-2"
            >
              {history.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No attendance records yet.</p>
              ) : (
                <AttendanceList rows={history} />
              )}
              {isPresentToday && (
                <button
                  onClick={() => navigate('/employee/attendance')}
                  className="mt-4 w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
                >
                  Continue your day
                </button>
              )}
            </Panel>
            <Panel title="Quick Links">
              <QuickActions
                actions={[
                  { label: 'Apply Leave', to: '/employee/leaves/apply', tone: 'purple' },
                  { label: 'Apply WFH', to: '/employee/wfh', tone: 'blue' },
                  { label: 'View Payslips', to: '/employee/payslips', tone: 'green' },
                  { label: 'Holiday Calendar', to: '/super-admin/holidays', tone: 'yellow' },
                ]}
              />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Upcoming Holidays" action={<ViewAll to="/super-admin/holidays" />} className="lg:col-span-2">
              {holidays.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No holidays configured.</p>
              ) : (
                <HolidayList rows={holidays} />
              )}
            </Panel>
            <Panel title="Notifications">
              <p className="text-sm text-slate-500">
                Your notifications are listed on the Notifications page.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

// ---- live data ----

function useDashboard(): { data: DashSummary | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ data: DashSummary | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;
    setState({ data: null, loading: true, error: null });
    dashboardService
      .getEmployeeSummary()
      .then((data) => {
        if (mounted) setState({ data, loading: false, error: null });
      })
      .catch(() => {
        if (mounted) setState({ data: null, loading: false, error: 'Could not load the dashboard.' });
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

function toTitledStats(summary: DashSummary | null): TitledStat[] {
  if (!summary) return [];
  return summary.stats.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.value,
    subLabel: s.subLabel,
    href: s.href,
    tone: s.tone,
    available: s.available,
  }));
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00+05:30`);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toDayStatus(status: string): HistoryRow['status'] {
  if (status === 'PRESENT') return 'Present';
  if (status === 'PARTIAL') return 'Late';
  if (status === 'MISSED_PUNCH') return 'Absent';
  return 'Absent';
}
