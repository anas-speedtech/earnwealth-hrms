import { useState, useEffect, useCallback } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceService, AttendanceRecord, AttendanceImport } from '../../services/attendance.service';
import { organizationService } from '../../services/organization.service';
import toast from 'react-hot-toast';

interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
  designation: string;
}

type ViewMode = 'rows' | 'import' | 'history';

export default function HRAttendancePage() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<ViewMode>('rows');

  // --- row-based view (all employees, filterable) ---
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  // --- upload ---
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [imports, setImports] = useState<AttendanceImport[]>([]);

  const displayName = (user?.profile?.fullName as string) || user?.email || 'HR Admin';

  const loadEmployees = useCallback(async () => {
    try {
      const page = await organizationService.getEmployees({ page: 1 });
      setEmployees((page.data || []).map((e) => ({
        id: e.id,
        employeeCode: e.employeeCode || '',
        name: e.firstName && e.lastName ? `${e.firstName} ${e.lastName}` : 'Unknown',
        designation: e.designation?.name || '',
      })));
    } catch {
      setEmployees([]);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const loadRows = useCallback(async () => {
    setRowsLoading(true);
    try {
      if (selectedCode) {
        const emp = employees.find((e) => e.employeeCode === selectedCode);
        if (emp) {
          const result = await attendanceService.getEmployeeHistory(emp.id, 1, startDate || undefined, endDate || undefined);
          setRows(result.records);
          return;
        }
      }
      // No filter: pull history for each employee (paginated on the server side
      // per employee; for the row view we aggregate the first page each).
      const settled = await Promise.allSettled(
        employees.map((e) => attendanceService.getEmployeeHistory(e.id, 1, startDate || undefined, endDate || undefined))
      );
      const collected: AttendanceRecord[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') collected.push(...r.value.records);
      }
      setRows(collected);
    } catch {
      toast.error('Failed to load attendance rows.');
    } finally {
      setRowsLoading(false);
    }
  }, [employees, selectedCode, startDate, endDate]);

  useEffect(() => {
    if (view === 'rows') loadRows();
  }, [view, loadRows]);

  const loadImports = useCallback(async () => {
    try {
      setImports(await attendanceService.listImports());
    } catch {
      // table not present or not authorized — leave empty
    }
  }, []);

  useEffect(() => {
    if (view === 'import') loadImports();
  }, [view, loadImports]);

  const handleImport = async () => {
    if (!importFile) {
      toast.error('Choose a .dat file first.');
      return;
    }
    setImportBusy(true);
    try {
      const result = await attendanceService.importDat(importFile);
      toast.success(`Imported ${result.matched} punch rows${result.duplicates ? ` (${result.duplicates} duplicates skipped)` : ''}.`);
      if (result.unmatched.length) {
        toast.error(`${result.unmatched.length} rows had an unrecognized employee code: ${result.unmatched.join(', ')}`);
      }
      if (result.skipped.length) {
        toast.error(`Skipped ${result.skipped.length} unparseable rows.`);
      }
      setImportFile(null);
      loadImports();
      loadRows();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Import failed.';
      toast.error(message);
    } finally {
      setImportBusy(false);
    }
  };

  const formatTime = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatMinutes = (mins: number) => {
    if (!mins) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'PRESENT': return 'bg-green-100 text-green-700';
      case 'PARTIAL': return 'bg-yellow-100 text-yellow-700';
      case 'MISSED_PUNCH': return 'bg-red-100 text-red-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Attendance" subtitle="Upload biometric data and review row-level attendance" />
      <div className="p-8 max-w-6xl">
        {/* view tabs */}
        <div className="mb-6 flex gap-6 border-b border-slate-200">
          {([['rows', 'Row View'], ['import', 'Upload & Imports'], ['history', 'Single Employee']] as [ViewMode, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition ${
                view === key ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'rows' && (
          <div>
            <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Employee (code)</label>
                <select
                  value={selectedCode}
                  onChange={(e) => setSelectedCode(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">All employees</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.employeeCode}>
                      {e.name} ({e.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <button onClick={loadRows} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                Refresh
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              {rowsLoading ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No attendance rows found. Upload a biometric file first.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Punch In</th>
                      <th className="px-4 py-3 font-medium">Punch Out</th>
                      <th className="px-4 py-3 font-medium">Sessions</th>
                      <th className="px-4 py-3 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-700">{formatDate(r.date)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(r.status)}`}>
                            {r.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatTime(r.sessions[0]?.punchIn || '')}</td>
                        <td className="px-4 py-3 text-slate-600">{formatTime(r.sessions[0]?.punchOut || '')}</td>
                        <td className="px-4 py-3 text-slate-600">{r.sessions.length}</td>
                        <td className="px-4 py-3 text-slate-600">{formatMinutes(r.totalMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {view === 'import' && (
          <div>
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-1 text-lg font-semibold text-slate-900">Upload Biometric File</h3>
              <p className="mb-4 text-sm text-slate-500">
                Upload a raw <code>.dat</code> export from the biometric device. Each row is matched to an
                employee by Employee Code and stored as a punch event.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">.dat file</label>
                <input
                  type="file"
                  accept=".dat,.txt"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="w-full text-sm"
                />
                {importFile && (
                  <p className="mt-1 text-xs text-slate-400">
                    Selected: {importFile.name} ({Math.max(0, Math.round(importFile.size / 1024))} KB)
                  </p>
                )}
              </div>
              <button
                onClick={handleImport}
                disabled={importBusy || !importFile}
                className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {importBusy ? 'Importing…' : 'Import File'}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">Recent Imports</h3>
              </div>
              {imports.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No imports yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">When</th>
                      <th className="px-4 py-3 font-medium">File</th>
                      <th className="px-4 py-3 font-medium">Rows</th>
                      <th className="px-4 py-3 font-medium">Unknown Codes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imports.map((imp) => (
                      <tr key={imp.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 text-slate-600">{new Date(imp.importedAt).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-slate-600">{imp.fileName || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {imp.savedRows}/{imp.totalRows}
                          {imp.duplicateRows > 0 && <span className="ml-1 text-xs text-amber-600">({imp.duplicateRows} dup)</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {imp.unknownCodes.length ? imp.unknownCodes.join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {view === 'history' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Use the <strong>Row View</strong> tab with the Employee filter to review a single employee's
            punches in detail.
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
