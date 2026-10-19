import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
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
      <div className="p-8 max-w-6xl">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">Employee</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Records loaded</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{records.length}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">First record</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {records.length > 0 ? records[records.length - 1].date : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Last record</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {records.length > 0 ? records[0].date : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Latest status</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {records.length > 0 ? records[0].status : '—'}
                </p>
              </div>
            </div>
            {summary && (
              <p className="mb-6 text-sm text-slate-600">
                Summary for the selected period: {summary.totalPresent} present, {summary.totalPartial} partial,{' '}
                {summary.totalMinutes} minutes recorded in total.
              </p>
            )}
            {isLoading ? (
              <p className="text-slate-500">Loading records…</p>
            ) : records.length === 0 ? (
              <p className="text-slate-500">No attendance records for this period.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium text-slate-500">Date</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Mode</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Duration</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Punch In</th>
                      <th className="px-4 py-3 font-medium text-slate-500">Punch Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-700">{record.date}</td>
                        <td className="px-4 py-3 text-slate-600">{record.workMode}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            {record.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {record.totalMinutes > 0
                            ? `${Math.floor(record.totalMinutes / 60)}h ${record.totalMinutes % 60}m`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {record.sessions[0]?.punchIn
                            ? new Date(record.sessions[0].punchIn).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
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
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}

export default AdminAttendanceReviewPage;
export { AdminAttendanceReviewPage as AttendanceReviewPage };
