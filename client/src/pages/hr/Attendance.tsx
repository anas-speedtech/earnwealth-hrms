import { useState, useEffect, useCallback } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceService, AttendanceRecord } from '../../services/attendance.service';
import toast from 'react-hot-toast';

export default function HRAttendancePage() {
  const { user, logout } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchRecords = useCallback(async () => {
    if (!employeeId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const result = await attendanceService.getEmployeeHistory(employeeId, 1, startDate, endDate);
      setRecords(result.records);
    } catch {
      toast.error('Failed to load attendance records.');
    } finally {
      setLoading(false);
    }
  }, [employeeId, startDate, endDate]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const formatTime = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatMinutes = (mins: number) => {
    if (!mins) return '—';
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <DashboardShell
      role="HR_ADMIN"
      userName={(user?.profile?.fullName as string) || user?.email || 'HR Admin'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Attendance Review" subtitle="View and manage employee attendance records" />
      <div className="p-8 max-w-5xl">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Employee ID</label>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="Employee profile ID"
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="pt-5">
              <button
                onClick={fetchRecords}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Filter
              </button>
            </div>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Attendance Records</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No attendance records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Mode</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Punch In</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Punch Out</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm text-slate-900">{formatDate(record.date)}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{record.workMode}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          record.status === 'PRESENT'
                            ? 'bg-green-100 text-green-700'
                            : record.status === 'PARTIAL'
                            ? 'bg-yellow-100 text-yellow-700'
                            : record.status === 'MISSED_PUNCH'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {record.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatMinutes(record.totalMinutes)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {record.sessions[0]?.punchIn ? formatTime(record.sessions[0].punchIn) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {record.sessions[0]?.punchOut ? formatTime(record.sessions[0].punchOut) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        {record.corrected && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            Corrected
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
