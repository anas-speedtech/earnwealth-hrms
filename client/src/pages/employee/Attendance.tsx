import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarX2, Lock, Pencil } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { attendanceService, MyMatrix, MyMatrixDay, ApplyPunchResult } from '../../services/attendance.service';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import toast from 'react-hot-toast';

const CARD = 'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function EmployeeAttendancePage() {
  const { user, logout } = useAuth();

  // Calendar defaults to the current month, but the data can be historical —
  // the picker spans 8 years back so old months stay reachable.
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [matrix, setMatrix] = useState<MyMatrix | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  // Day-click state
  const [selectedDay, setSelectedDay] = useState<MyMatrixDay | null>(null);
  const [punchIn, setPunchIn] = useState('');
  const [punchOut, setPunchOut] = useState('');
  const [applying, setApplying] = useState(false);

  const loadMatrix = useCallback(async () => {
    setMatrixLoading(true);
    setMatrixError(null);
    try {
      setMatrix(await attendanceService.getMyMatrix(year, month));
    } catch {
      setMatrixError('Could not load the attendance calendar.');
    } finally {
      setMatrixLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const daysInMonth = matrix?.daysInMonth ?? new Date(year, month, 0).getDate();
  const dayNumbers = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  const openDayEditor = (day: MyMatrixDay) => {
    setSelectedDay(day);
    setPunchIn(day.in || '');
    setPunchOut(day.out || '');
  };

  const handleApply = async () => {
    if (!selectedDay || !punchIn) {
      toast.error('Punch-in time is required.');
      return;
    }
    setApplying(true);
    try {
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(selectedDay.day).padStart(2, '0')}`;
      const result: ApplyPunchResult = await attendanceService.applyPunch({
        date: dateKey,
        punchIn,
        punchOut: punchOut || undefined,
      });
      toast.success(`Punch applied for ${dateKey} (${result.punchIn} – ${result.punchOut || '—'}).`);
      setSelectedDay(null);
      await loadMatrix();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        'Could not apply the punch. Please try again.';
      toast.error(message);
    } finally {
      setApplying(false);
    }
  };

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Employee';

  const SELECT =
    'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10';

  return (
    <DashboardShell role="EMPLOYEE" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Attendance" subtitle="Your month-by-month punch calendar" />
      <div className="p-6 max-w-[92rem]">
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
              {Array.from({ length: 8 }, (_, i) => now.getFullYear() - 7 + i).map((y) => (
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
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-100 ring-1 ring-inset ring-red-300" /> Holiday
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-100 ring-1 ring-inset ring-slate-300" /> Weekly off
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-cyan-50 text-cyan-600 ring-1 ring-inset ring-cyan-200">
                <Pencil size={7} />
              </span>
              You can apply a punch
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200">
                <Lock size={7} />
              </span>
              Locked (device data)
            </span>
          </div>
        </div>

        {matrixError && (
          <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-100">{matrixError}</p>
        )}

        {matrixLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
            <Spinner size="md" /> Loading calendar…
          </div>
        ) : !matrix || matrix.days.length === 0 ? (
          <div className={CARD}>
            <EmptyState
              icon={<CalendarX2 size={20} />}
              title="No attendance data"
              description="No records exist for this month yet."
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
                  {dayNumbers.map((d) => {
                    const meta = matrix.days[d - 1];
                    return (
                      <th key={d} className={`min-w-[2.5rem] px-1 py-2.5 text-center text-[11px] font-semibold ${meta?.isOffDay ? (meta.holidayName ? 'text-red-400' : 'text-slate-400') : 'text-slate-400'}`}>
                        {d}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100">
                  <td className="sticky left-0 z-10 border-r border-slate-100 bg-white px-3 py-2 font-medium text-slate-700">
                    {matrix.employee.employeeCode}
                  </td>
                  <td className="sticky left-[4.75rem] z-10 border-r border-slate-100 bg-white px-3 py-2 text-slate-600">
                    {matrix.employee.name || user?.email}
                  </td>
                  {matrix.days.map((cell) => (
                    <td key={cell.day} className="min-w-[2.5rem] px-0.5 py-1">
                      {renderDayCell(cell, () => openDayEditor(cell))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {!matrixLoading && matrix && matrix.days.length > 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            Click a day to view or apply punches. Days with device attendance are locked — they come from your
            biometric import and cannot be edited here. You can apply a punch-in / punch-out only on days with an
            approved WFH request that have no device data. Punching on a weekly off (Sat/Sun) or a holiday earns a
            comp-off credit.
          </p>
        )}

        {/* Day editor */}
        <Modal
          isOpen={!!selectedDay}
          onClose={() => setSelectedDay(null)}
          title={
            selectedDay
              ? `Day ${selectedDay.day}, ${MONTH_NAMES[month - 1]} ${year}`
              : ''
          }
          size="sm"
          footer={
            selectedDay && (
              <>
                <Button variant="ghost" onClick={() => setSelectedDay(null)}>
                  Close
                </Button>
                {selectedDay.canSelfPunch && (
                  <Button variant="primary" onClick={handleApply} isLoading={applying}>
                    Apply Punch
                  </Button>
                )}
              </>
            )
          }
        >
          {selectedDay && (
            <div className="space-y-4">
              {selectedDay.holidayName && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 ring-1 ring-inset ring-red-100">
                  {selectedDay.holidayName} — holiday. A punch this day earns a comp-off credit.
                </p>
              )}
              {selectedDay.isWeeklyOff && !selectedDay.holidayName && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600 ring-1 ring-inset ring-slate-200">
                  Weekly off (Saturday/Sunday). A punch this day earns a comp-off credit.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-slate-600">Punch In</label>
                  <Input
                    type="time"
                    value={punchIn}
                    onChange={(e) => setPunchIn(e.target.value)}
                    disabled={!selectedDay.canSelfPunch}
                    placeholder="--:--"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-slate-600">Punch Out</label>
                  <Input
                    type="time"
                    value={punchOut}
                    onChange={(e) => setPunchOut(e.target.value)}
                    disabled={!selectedDay.canSelfPunch}
                    placeholder="--:--"
                  />
                </div>
              </div>

              {!selectedDay.canSelfPunch && (
                <p className="text-[12px] leading-relaxed text-slate-500">
                  {selectedDay.locked ? (
                    <>This day has device attendance and is <span className="font-medium text-slate-700">locked</span>. Corrections go through HR.</>
                  ) : selectedDay.hasPunch ? (
                    <>Your punch times for this day are shown above. Manual entries can be re-applied on WFH days.</>
                  ) : (
                    <>You can apply a punch here only on a day with an approved WFH request. Apply for WFH first, then come back and punch in/out.</>
                  )}
                </p>
              )}

              {selectedDay.status && (
                <p className="text-[12px] text-slate-500">
                  Day status:{' '}
                  <span className="font-medium text-slate-700">
                    {selectedDay.status === 'P' ? 'Present' : selectedDay.status === 'H' ? 'Half day' : selectedDay.status === 'L' ? 'Leave' : 'No data'}
                  </span>
                </p>
              )}
            </div>
          )}
        </Modal>
      </div>
    </DashboardShell>
  );
}

// Mirrors the HR matrix cell rendering, plus the two employee-specific states
// (locked / you-can-apply). Cells are clickable so an employee opens the day
// editor.
function renderDayCell(cell: MyMatrixDay, onOpen: () => void) {
  const base =
    'group relative flex h-11 w-full flex-col items-center justify-center rounded-md border text-center transition';

  // Read-only states with a device punch → show times + status colour.
  if (cell.hasPunch && cell.locked) {
    const tone =
      cell.status === 'P'
        ? 'border-emerald-200 bg-emerald-50'
        : cell.status === 'H'
          ? 'border-orange-200 bg-orange-50'
          : 'border-slate-200 bg-slate-50';
    return (
      <button
        type="button"
        onClick={onOpen}
        title="Locked — device attendance. Click to view."
        className={`${base} ${tone} hover:ring-2 hover:ring-cyan-400/30`}
      >
        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-slate-700">
          <Lock size={9} className="text-slate-400" />
          {cell.in}
        </span>
        <span className="text-[10px] text-slate-500">{cell.out || '—'}</span>
      </button>
    );
  }

  // Employee can apply a punch here (approved WFH, no device data).
  if (cell.canSelfPunch) {
    const hasTimes = !!cell.in;
    return (
      <button
        type="button"
        onClick={onOpen}
        title={hasTimes ? 'Your applied punch. Click to edit.' : 'Apply punch-in / punch-out.'}
        className={`${base} ${hasTimes
          ? cell.status === 'P'
            ? 'border-cyan-200 bg-cyan-50 hover:ring-2 hover:ring-cyan-400/40'
            : 'border-cyan-200 bg-cyan-50/60 hover:ring-2 hover:ring-cyan-400/40'
          : 'border-dashed border-cyan-400 bg-cyan-50/40 hover:ring-2 hover:ring-cyan-400/40'}`}
      >
        {hasTimes ? (
          <>
            <span className="text-[10px] font-semibold text-cyan-800">{cell.in}</span>
            <span className="text-[10px] text-cyan-600">{cell.out || '—'}</span>
          </>
        ) : (
          <span className="flex flex-col items-center text-cyan-600">
            <Pencil size={11} />
            <span className="text-[9px] font-medium">Apply</span>
          </span>
        )}
      </button>
    );
  }

  // Holiday.
  if (cell.holidayName) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title={cell.holidayName}
        className={`${base} border-red-200 bg-red-50 hover:ring-2 hover:ring-red-400/30`}
      >
        <span className="text-[10px] font-semibold text-red-600">{cell.holidayName}</span>
        {cell.in && <span className="text-[10px] text-red-500/80">{cell.in}–{cell.out || '—'}</span>}
      </button>
    );
  }

  // Weekly off.
  if (cell.isWeeklyOff) {
    return (
      <button
        type="button"
        onClick={onOpen}
        title="Weekly off (Sat/Sun)"
        className={`${base} border-slate-200 bg-slate-50 hover:ring-2 hover:ring-cyan-400/30`}
      >
        <span className="text-[10px] font-semibold text-slate-400">Off</span>
      </button>
    );
  }

  // Plain working day with no data.
  return (
    <button
      type="button"
      onClick={onOpen}
      title="No attendance — no punch, no WFH, no leave"
      className={`${base} border-dashed border-slate-300 bg-white hover:ring-2 hover:ring-cyan-400/30`}
    >
      <span className="text-[10px] text-slate-300">—</span>
    </button>
  );
}
