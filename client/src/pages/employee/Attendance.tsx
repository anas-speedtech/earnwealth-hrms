import { useState, useEffect, useCallback } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceService, OpenSession, AttendanceRecord, AttendanceSummary } from '../../services/attendance.service';
import toast from 'react-hot-toast';

export default function EmployeeAttendancePage() {
  const { user } = useAuth();
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employeeId = user?.id;

  const fetchOpenSession = useCallback(async () => {
    try {
      const session = await attendanceService.getOpenSession();
      setOpenSession(session);
    } catch {
      setOpenSession(null);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const result = await attendanceService.getMyHistory();
      setHistory(result.records);
      setError(null);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to load attendance history.';
      toast.error(message);
      setError(message);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    if (!employeeId) return;
    try {
      const result = await attendanceService.getEmployeeSummary(employeeId);
      setSummary(result);
    } catch {
      setSummary(null);
    }
  }, [employeeId]);

  useEffect(() => {
    async function load() {
      if (!employeeId) {
        setError('No employee profile is available for this account.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      await Promise.all([fetchOpenSession(), fetchHistory(), fetchSummary()]);
      setLoading(false);
    }
    load();
  }, [employeeId, fetchOpenSession, fetchHistory, fetchSummary]);

  const handlePunchIn = async () => {
    if (!employeeId) return;
    setPunching(true);
    try {
      const result = await attendanceService.punchIn({ employeeId, workMode: 'OFFICE' });
      // Derive a session object from the persistent event without inventing a work mode.
      setOpenSession({ id: result.id, punchIn: result.punchIn, workMode: 'Office' });
      toast.success('Punched in successfully.');
      await Promise.all([fetchOpenSession(), fetchHistory()]);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to punch in.';
      toast.error(message);
      setError(message);
    } finally {
      setPunching(false);
    }
  };

  const handlePunchOut = async () => {
    if (!employeeId) return;
    setPunching(true);
    try {
      const result = await attendanceService.punchOut({ employeeId });
      setOpenSession(null);
      toast.success(`Punched out. Duration: ${result.durationMinutes} minutes.`);
      await Promise.all([fetchOpenSession(), fetchHistory(), fetchSummary()]);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to punch out.';
      toast.error(message);
      setError(message);
    } finally {
      setPunching(false);
    }
  };

  const formatTime = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatMinutes = (mins: number) => {
    const minutes = mins || 0;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (hours > 0) return `${hours}h ${remainder}m`;
    return `${remainder}m`;
  };

  const today = new Date().toLocaleDateString('en-CA');
  const todayRecords = history.filter((record) => record.date.slice(0, 10) === today);
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (!user) {
    return null;
  }

  return (
    <DashboardShell role="EMPLOYEE" userName={user?.email || 'Employee'} userEmail={user?.email || ''} onLogout={async () => {}}>
      <Header title="Attendance" subtitle="Punch in, punch out, and view your attendance" />
      <div className="p-8 max-w-5xl">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Today — {todayStr}</h3>
          <div className="flex items-center gap-4 mb-6">
            {openSession ? (
              <>
                <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-700 font-medium">Latest IN event</p>
                  <p className="text-2xl font-bold text-green-800 mt-1">{formatTime(openSession.punchIn)}</p>
                  <p className="text-xs text-green-600 mt-1">Open session ID: {openSession.id}</p>
                </div>
                <button
                  onClick={handlePunchOut}
                  disabled={punching}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {punching ? 'Punching out...' : 'Punch Out'}
                </button>
              </>
            ) : (
              <>
                <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-slate-500 font-medium">No open session</p>
                  <p className="text-lg text-slate-700 mt-1">Punch in to create an IN event</p>
                  <p className="text-xs text-slate-500 mt-2">Work mode is not persisted by the existing attendance schema.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePunchIn}
                    disabled={punching || !employeeId}
                    className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {punching ? 'Punching in...' : 'Punch In'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {summary && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Attendance summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div>
                <p className="text-xs text-slate-500">Dates</p>
                <p className="text-xl font-semibold text-slate-900">{summary.totalDays}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Present</p>
                <p className="text-xl font-semibold text-slate-900">{summary.totalPresent}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Partial</p>
                <p className="text-xl font-semibold text-slate-900">{summary.totalPartial}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Minutes</p>
                <p className="text-xl font-semibold text-slate-900">{summary.totalMinutes}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sessions</p>
                <p className="text-xl font-semibold text-slate-900">{summary.totalSessions}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Average</p>
                <p className="text-xl font-semibold text-slate-900">{summary.avgMinutesPerDay}m</p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Today's punch history</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : todayRecords.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No attendance records yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {todayRecords.map((record) => (
                <div key={record.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{formatDate(record.date)}</p>
                    <span className={`inline-flex mt-1 px-2 py-1 rounded-full text-xs font-medium ${record.status === 'PRESENT' ? 'bg-green-100 text-green-700' : record.status === 'PARTIAL' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-700'}`}>{record.status}</span>
                  </div>
                  <div className="text-right text-sm text-slate-700">
                    {record.totalMinutes > 0 && <p>{formatMinutes(record.totalMinutes)}</p>}
                    {record.sessions?.[0]?.punchIn && (
                      <p className="text-xs text-slate-400">{formatTime(record.sessions[0].punchIn)}{record.sessions[0].punchOut ? ` – ${formatTime(record.sessions[0].punchOut)}` : ''}</p>
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