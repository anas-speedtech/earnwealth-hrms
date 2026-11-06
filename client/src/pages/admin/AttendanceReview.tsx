import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceService, AttendanceRecord, AttendanceSummary } from '../../services/attendance.service';
import { organizationService } from '../../services/organization.service';

interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
}

export function AdminAttendanceReviewPage({ role = 'HR_ADMIN' }: { role?: string }) {
  const { user, logout } = useAuth();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    organizationService
      .getEmployees({ page: 1 })
      .then((response) => {
        if (!mounted) return;
        setEmployees(
          response.data.map((employee) => ({
            id: employee.id,
            employeeCode: employee.employeeCode,
            name: `${employee.firstName} ${employee.lastName}`.trim(),
          })),
        );
      })
      .catch(() => {
        // leave the selector empty
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setRecords([]);
      setSummary(null);
      setIsLoading(false);
      return;
    }
    let mounted = true;
    setIsLoading(true);
    setError(null);
    attendanceService
      .getEmployeeHistory(selectedEmployeeId, 1)
      .then((result) => {
        if (!mounted) return;
        setRecords(result.records);
        return attendanceService.getEmployeeSummary(selectedEmployeeId).then((summary) => {
          if (mounted) setSummary(summary);
        });
      })
      .then(() => {
        if (mounted) setIsLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setError('Could not load this employee’s attendance.');
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployeeId]);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Admin';

  return (
    <DashboardShell role={role} userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Attendance Review" subtitle="Review per-employee attendance records" />
      <div className="mx-auto max-w-6xl p-6">
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
        )}

        <div className="mb-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
          <label htmlFor="attendance-employee" className="mb-1.5 block text-[12px] font-medium text-slate-600">Employee</label>
          <select
            id="attendance-employee"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
          >
            <option value="">Select an employee…</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employeeCode} – {employee.name}
              </option>
            ))}
          </select>
        </div>

        {selectedEmployeeId && (
          <>
            <div className="mb-5 grid gap-px overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)] sm:grid-cols-4">
              <div className="bg-white px-5 py-4">
                <p className="text-xs font-medium text-slate-400">Records loaded</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{records.length}</p>
              </div>
              <div className="bg-white px-5 py-4">
                <p className="text-xs font-medium text-slate-400">First record</p>
                <p className="mt-1 text-[13px] font-medium text-slate-900">
                  {records.length > 0 ? records[records.length - 1].date : '—'}
                </p>
              </div>
              <div className="bg-white px-5 py-4">
                <p className="text-xs font-medium text-slate-400">Last record</p>
                <p className="mt-1 text-[13px] font-medium text-slate-900">
                  {records.length > 0 ? records[0].date : '—'}
                </p>
              </div>
              <div className="bg-white px-5 py-4">
                <p className="text-xs font-medium text-slate-400">Latest status</p>
                <p className="mt-1 text-[13px] font-medium text-slate-900">
                  {records.length > 0 ? records[0].status : '—'}
                </p>
              </div>
            </div>
            {summary && (
              <p className="mb-5 text-[13px] text-slate-500">
                Summary for the selected period: {summary.totalPresent} present, {summary.totalPartial} partial,{' '}
                {summary.totalMinutes} minutes recorded in total.
              </p>
            )}
            {isLoading ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
                <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
                  <Spinner size="md" /> Loading…
                </div>
              </div>
            ) : records.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
                <EmptyState
                  title="No attendance records"
                  description="No attendance records are available for this employee and period."
                />
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/60">
                    <tr>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Date</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mode</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Duration</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Punch In</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Punch Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-[13px] font-medium text-slate-900">{record.date}</td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">{record.workMode}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-700 ring-1 ring-inset ring-cyan-200">
                            {record.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">
                          {record.totalMinutes > 0
                            ? `${Math.floor(record.totalMinutes / 60)}h ${record.totalMinutes % 60}m`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">
                          {record.sessions[0]?.punchIn
                            ? new Date(record.sessions[0].punchIn).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">
                          {record.sessions[0]?.punchOut
                            ? new Date(record.sessions[0].punchOut).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

export default AdminAttendanceReviewPage;
export { AdminAttendanceReviewPage as AttendanceReviewPage };
