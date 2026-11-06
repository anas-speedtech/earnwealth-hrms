import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarX2, Info } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import {
  attendanceService,
  AttendanceImport,
  AttendanceMatrix,
  MatrixDay,
} from '../../services/attendance.service';
import toast from 'react-hot-toast';

type ViewMode = 'calendar' | 'import';

const CARD =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';

const SELECT =
  'h-9 w-40 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10';

const MONTH_NAMES = [
  'January','February','March','April','May','June','July','August','September','October','November','December',
];

// Hover tooltip that explains the cell colours without taking up space under
// the grid. The full rule set (working hours, FHDL/SHDL, comp-off, editable
// empty days) is shown on demand.
function CellLegendTip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative mt-3 inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
      >
        <Info size={13} />
        Legend
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-[26rem] max-w-[90vw] rounded-xl border border-slate-200/90 bg-white p-4 text-left shadow-[0_12px_32px_-8px_rgba(15,23,42,0.16)]">
          <p className="mb-2.5 text-[13px] font-semibold text-slate-900">How cells are marked</p>
          <ul className="space-y-2 text-[12px] leading-relaxed text-slate-600">
            <li>
              <span className="font-medium text-slate-700">Working day:</span> 09:30 in, 18:30 out, with a break
              after 13:45.
            </li>
            <li>
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100 ring-1 ring-inset ring-emerald-300" />{' '}
              <span className="font-medium text-slate-700">Green</span> — first in by 09:30 and last out at or after
              18:30 (full day present).
            </li>
            <li>
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-100 ring-1 ring-inset ring-orange-300" />{' '}
              <span className="font-medium text-slate-700">Orange</span> — half day.{' '}
              <span className="mx-1 rounded-sm bg-orange-100 px-1 text-[10px] font-semibold text-orange-700">FHDL</span>
              first in after 09:30,{' '}
              <span className="mx-1 rounded-sm bg-orange-100 px-1 text-[10px] font-semibold text-orange-700">SHDL</span>{' '}
              last out before 18:30,{' '}
              <span className="mx-1 rounded-sm bg-orange-100 px-1 text-[10px] font-semibold text-orange-700">HDL</span>{' '}
              only one side captured.
            </li>
            <li>
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />{' '}
              <span className="font-medium text-slate-700">Red</span> — approved leave day.
            </li>
            <li>
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-100 ring-1 ring-inset ring-violet-300" />{' '}
              <span className="font-medium text-slate-700">Purple (CO)</span> — punched in on a weekend/holiday;
              comp-off credit (valid 3 months).
            </li>
            <li>
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-slate-300" />{' '}
              <span className="font-medium text-slate-700">Empty dashed box</span> — no device entry that day
              (full-day leave or WFH); the employee can update the punch times from their own Attendance page.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default function HRAttendancePage() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<ViewMode>('calendar');

  // --- calendar view state ---
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [matrix, setMatrix] = useState<AttendanceMatrix | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  // --- upload ---
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [imports, setImports] = useState<AttendanceImport[]>([]);

  const displayName = (user?.profile?.fullName as string) || user?.email || 'HR Admin';

  // ============ calendar (month matrix) ============

  const loadMatrix = useCallback(async () => {
    setMatrixLoading(true);
    setMatrixError(null);
    try {
      setMatrix(await attendanceService.getMatrix(year, month));
    } catch {
      setMatrixError('Could not load the attendance calendar.');
    } finally {
      setMatrixLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    if (view === 'calendar') loadMatrix();
  }, [view, loadMatrix]);

  // ============ import ============

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
      loadMatrix();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Import failed.';
      toast.error(message);
    } finally {
      setImportBusy(false);
    }
  };

  // ============ matrix cell rendering ============

  // Working window is 09:30 in / 18:30 out, lunch break after 13:45.
  //  - approved leave day      -> solid red "Leave"
  //  - punched on an off day   -> purple "CO" marker (comp-off eligible)
  //  - full present            -> green, both punch times
  //  - FHDL / SHDL / HDL       -> orange with the matching tag
  //  - no data on a working day -> grey dashed box: no device entry for that
  //    day (full-day leave, WFH, or an un-imported day) — the employee can
  //    still update the punch times from their own Attendance page.
  const renderDayCell = (cell: MatrixDay) => {
    if (cell.onLeave) {
      return (
        <div className="flex h-full min-h-[2.75rem] items-center justify-center rounded-sm bg-red-500 px-1 py-1">
          <span className="text-[11px] font-medium leading-tight text-white">Leave</span>
        </div>
      );
    }

    if (cell.compOffEligible) {
      return (
        <div className="flex min-h-[2.75rem] flex-col justify-between rounded-sm bg-violet-100 px-1.5 py-1 text-violet-900">
          <div className="space-y-px text-[10px] leading-tight tabular-nums">
            {cell.in && <span>{cell.in}</span>}
            {cell.out && <span>{cell.out}</span>}
          </div>
          <span className="rounded-sm bg-violet-200/70 px-1 text-[9px] font-semibold text-violet-700">CO</span>
        </div>
      );
    }

    if (!cell.hasPunch) {
      return (
        <div className="min-h-[2.75rem] rounded-sm border border-dashed border-slate-200" />
      );
    }

    const isHdl = cell.halfDay;

    return (
      <div
        className={`flex min-h-[2.75rem] flex-col justify-between rounded-sm px-1.5 py-1 ${
          isHdl ? 'bg-orange-100 text-orange-900' : 'bg-emerald-100 text-emerald-900'
        }`}
      >
        <div className="space-y-px text-[10px] leading-tight tabular-nums">
          {cell.in && <span>{cell.in}</span>}
          {cell.out && <span>{cell.out}</span>}
        </div>
        {isHdl && (
          <div className="flex flex-wrap gap-0.5">
            {cell.halfDayTags.map((tag) => (
              <span key={tag} className="rounded-sm bg-orange-200/70 px-1 text-[9px] font-semibold text-orange-700">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const dayNumbers = useMemo(() => {
    const days = matrix?.daysInMonth ?? new Date(year, month, 0).getDate();
    return Array.from({ length: days }, (_, i) => i + 1);
  }, [matrix, year, month]);

  // ============ view ============

  const views: [ViewMode, string][] = [
    ['calendar', 'Calendar'],
    ['import', 'Upload & Imports'],
  ];

  return (
    <DashboardShell role="HR_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Attendance" subtitle="Month-by-month punch calendar and biometric imports" />
      <div className="p-6 max-w-[92rem]">
        {/* view tabs */}
        <div className="mb-6 flex gap-6 border-b border-slate-200">
          {views.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`-mb-px border-b-2 px-1 pb-3 text-[13px] font-medium transition ${
                view === key ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ================= CALENDAR VIEW ================= */}
        {view === 'calendar' && (
          <div>
            <div className={`mb-4 flex flex-wrap items-end gap-4 p-4 sm:p-5 ${CARD}`}>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Month</label>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={SELECT}>
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Year</label>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={SELECT}>
                  {[year - 1, year, year + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-4 self-end pb-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100 ring-1 ring-inset ring-emerald-300" /> Present
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-100 ring-1 ring-inset ring-orange-300" /> Half day
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Leave
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-100 ring-1 ring-inset ring-violet-300" /> Comp-off
                </span>
              </div>
            </div>

            {matrixError && (
              <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-100">
                {matrixError}
              </p>
            )}

            {matrixLoading ? (
              <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
                <Spinner size="md" />
                Loading calendar…
              </div>
            ) : !matrix || matrix.rows.length === 0 ? (
              <div className={CARD}>
                <EmptyState
                  icon={<CalendarX2 size={20} />}
                  title="No employees to display"
                  description="Add employees and import biometric data first."
                />
              </div>
            ) : (
              <div className={`overflow-x-auto ${CARD}`}>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Emp Code
                      </th>
                      <th className="sticky left-[4.75rem] z-10 border-r border-slate-100 bg-white px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Emp Name
                      </th>
                      {dayNumbers.map((d) => (
                        <th key={d} className="min-w-[2.5rem] px-1 py-2.5 text-center text-[11px] font-semibold text-slate-400">
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.employeeId} className="border-t border-slate-100">
                        <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2 font-medium text-slate-700">
                          {row.employeeCode}
                        </td>
                        <td className="sticky left-[4.75rem] z-10 border-r border-slate-100 bg-white px-3 py-2 text-slate-600">
                          {row.name}
                        </td>
                        {row.days.map((cell) => (
                          <td key={cell.day} className="min-w-[2.5rem] px-0.5 py-1">
                            {renderDayCell(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!matrixLoading && matrix && matrix.rows.length > 0 && (
              <CellLegendTip />
            )}
          </div>
        )}

        {/* ================= IMPORT VIEW ================= */}
        {view === 'import' && (
          <div>
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="mb-1 text-[15px] font-semibold text-slate-900">Upload Biometric File</h3>
              <p className="mb-4 text-[13px] text-slate-500">
                Upload a raw <code>.dat</code> export from the biometric device. Each row is matched to an
                employee by Employee Code and stored as a punch event.
              </p>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-slate-500">.dat file</label>
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
                className="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {importBusy ? 'Importing…' : 'Import File'}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-[15px] font-semibold text-slate-900">Recent Imports</h3>
              </div>
              {imports.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-slate-500">No imports yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/60 text-left">
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
      </div>
    </DashboardShell>
  );
}
