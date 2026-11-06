import { useState, useEffect } from 'react';
import { CalendarDays, Pencil, Settings2, AlertTriangle, Plus, Trash2, Info } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { leaveService, LeaveTypeItem } from '../../services/leave.service';
import toast from 'react-hot-toast';
import StatusBadge from '../../components/shared/StatusBadge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';

const CARD =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';

const todayISO = () => new Date().toISOString().slice(0, 10);

interface NewLeaveType {
  displayName: string;
  code: string;
  classification: 'PAID' | 'UNPAID';
  effectiveFrom: string;
  annualDays: string;
  noCap: boolean;
  boardOnly: boolean;
}

const emptyNewType = (): NewLeaveType => ({
  displayName: '',
  code: '',
  classification: 'PAID',
  effectiveFrom: todayISO(),
  annualDays: '',
  noCap: false,
  boardOnly: false,
});

// Leave configuration: the organisation-wide annual entitlements plus the two
// exception flags that decide who falls outside the normal cap.
//
//   - annualEntitlementDays  how many days of that type every employee gets a year
//   - isUnlimited            the type has no cap at all
//   - appliesToBoardLevel    the type only applies to board-level designations
//     (CEO / C-suite / board members), so the rest of the org is not covered
//
// Entitlements are set once here, then populated across the whole
// organisation with a single "Populate for the year" action.
export default function LeaveConfigPage() {
  const { user, logout } = useAuth();
  const [types, setTypes] = useState<LeaveTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState('');
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [boardLevel, setBoardLevel] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation lives inside the relevant card so we can render it
  // inline (no window.confirm).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Create form state.
  const [newType, setNewType] = useState<NewLeaveType>(emptyNewType);
  const [createBusy, setCreateBusy] = useState(false);
  const [createFormError, setCreateFormError] = useState<string | null>(null);

  const [populateYear, setPopulateYear] = useState(String(new Date().getFullYear()));
  const [populateBusy, setPopulateBusy] = useState(false);

  const displayName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : user?.email || 'Super Admin';

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setTypes(await leaveService.getAllLeaveTypes());
    } catch {
      setError('Failed to load leave types.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (t: LeaveTypeItem) => {
    setEditingId(t.id);
    setEntitlement(String(t.annualEntitlementDays ?? 0));
    setIsUnlimited(Boolean(t.isUnlimited));
    setBoardLevel(Boolean(t.appliesToBoardLevel));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEntitlement('');
    setIsUnlimited(false);
    setBoardLevel(false);
  };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      await leaveService.updateLeaveType(id, {
        annualEntitlementDays: isUnlimited ? 0 : Number(entitlement) || 0,
        isUnlimited,
        appliesToBoardLevel: boardLevel,
      });
      toast.success('Leave policy updated.');
      cancelEdit();
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Failed to update the leave policy.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const createType = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newType.displayName.trim() || !newType.code.trim()) {
      setCreateFormError('Display name and code are required.');
      return;
    }
    setCreateBusy(true);
    setCreateFormError(null);
    try {
      await leaveService.createLeaveType({
        name: newType.code,
        displayName: newType.displayName,
        code: newType.code,
        classification: newType.classification,
        effectiveFrom: newType.effectiveFrom,
        annualEntitlementDays: newType.noCap ? 0 : Number(newType.annualDays) || 0,
        isUnlimited: newType.noCap,
        appliesToBoardLevel: newType.boardOnly,
      });
      toast.success(`Leave type ${newType.displayName} created.`);
      setNewType(emptyNewType());
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Failed to create the leave type.';
      setCreateFormError(message);
      toast.error(message);
    } finally {
      setCreateBusy(false);
    }
  };

  const deleteType = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      await leaveService.deleteLeaveType(id);
      toast.success(`Removed ${name}.`);
      setConfirmDeleteId(null);
      load();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Failed to remove the leave type.';
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const runPopulate = async () => {
    setPopulateBusy(true);
    try {
      const result = await leaveService.populateYearlyBalances(Number(populateYear));
      toast.success(
        `Populated ${result.processed} of ${result.employees} employee record(s) for ${result.year}.`,
      );
      if (result.failed > 0) {
        toast.error(`${result.failed} employee(s) could not be populated.`);
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Failed to populate balances.';
      toast.error(message);
    } finally {
      setPopulateBusy(false);
    }
  };

  return (
    <DashboardShell role="SUPER_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Leave Configuration" subtitle="Annual leave policy, organisation-wide" />
      <div className="p-6 max-w-5xl">
        <div className={`mb-5 p-4 sm:p-5 ${CARD}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                <Settings2 size={16} />
              </span>
              <div>
                <h3 className="text-[15px] font-bold tracking-tight text-slate-900">Populate annual balances</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Creates each active employee&rsquo;s balance for the year from the entitlements set below.
                  Unlimited types are left uncapped; board-level types only apply to board designations.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={populateYear}
                onChange={(e) => setPopulateYear(e.target.value)}
                aria-label="Year"
                className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
              />
              <Button size="sm" onClick={runPopulate} disabled={populateBusy || !canManage} isLoading={populateBusy}>
                {populateBusy ? 'Populating…' : 'Populate'}
              </Button>
            </div>
          </div>
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-inset ring-red-100">{error}</p>}

        {canManage && !loading && (
          <form onSubmit={createType} className={`mb-5 p-4 sm:p-5 ${CARD}`}>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
                <Plus size={16} />
              </span>
              <div>
                <h3 className="text-[15px] font-bold tracking-tight text-slate-900">Add leave type</h3>
                <p className="mt-0.5 text-xs text-slate-400">Create a new organisation-wide leave type.</p>
              </div>
            </div>
            {createFormError && (
              <p className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-600/10">{createFormError}</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Display name"
                value={newType.displayName}
                onChange={(e) => setNewType({ ...newType, displayName: e.target.value })}
                placeholder="Casual Leave"
                required
              />
              <Input
                label="Code"
                value={newType.code}
                onChange={(e) => setNewType({ ...newType, code: e.target.value.toUpperCase() })}
                placeholder="CL"
                required
                className="w-24"
              />
              <Select
                label="Classification"
                value={newType.classification}
                onChange={(e) => setNewType({ ...newType, classification: e.target.value as NewLeaveType['classification'] })}
                options={[
                  { value: 'PAID', label: 'Paid' },
                  { value: 'UNPAID', label: 'Unpaid' },
                ]}
              />
              <Input
                label="Effective from"
                type="date"
                value={newType.effectiveFrom}
                onChange={(e) => setNewType({ ...newType, effectiveFrom: e.target.value })}
              />
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Annual days</label>
                <input
                  type="number"
                  min={0}
                  value={newType.annualDays}
                  disabled={newType.noCap}
                  onChange={(e) => setNewType({ ...newType, annualDays: e.target.value })}
                  className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-[13px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={newType.noCap}
                    onChange={(e) => setNewType({ ...newType, noCap: e.target.checked })}
                    className="h-4 w-4 rounded accent-cyan-600"
                  />
                  No cap
                </label>
                <label className="flex items-center gap-2 text-[13px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={newType.boardOnly}
                    onChange={(e) => setNewType({ ...newType, boardOnly: e.target.checked })}
                    className="h-4 w-4 rounded accent-cyan-600"
                  />
                  Board &amp; C-suite only
                </label>
              </div>
            </div>
            {(newType.noCap || newType.boardOnly) && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 ring-1 ring-amber-500/15">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                This type will apply only to Board &amp; C-suite members. Everyone else gets 0 days.
              </div>
            )}
            <div className="mt-4 flex items-center gap-3">
              <Button type="submit" size="sm" disabled={createBusy} isLoading={createBusy}>
                {createBusy ? 'Creating…' : 'Create leave type'}
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
            <Spinner size="md" />
            Loading leave types…
          </div>
        ) : types.length === 0 ? (
          <p className="text-[13px] text-slate-500">No leave types configured. Create them in Policies first.</p>
        ) : (
          <div className="space-y-4">
            {types.map((t) => {
              const isEditing = editingId === t.id;
              const label = t.displayName || t.name;
              return (
                <div key={t.id} className={`p-4 transition sm:p-5 ${CARD}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                        <CalendarDays size={16} />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[13px] font-semibold text-slate-900">{label}</p>
                          {t.isUnlimited && <StatusBadge tone="blue">No cap</StatusBadge>}
                          {t.appliesToBoardLevel && <StatusBadge tone="purple">Board &amp; C-suite only</StatusBadge>}
                          {!t.isUnlimited && !t.appliesToBoardLevel && <StatusBadge tone="slate">All employees</StatusBadge>}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">{t.code} &middot; {t.classification}</p>
                      </div>
                    </div>
                    {!isEditing && canManage && (
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
                          <Pencil size={14} />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id)}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 size={14} />
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  {!isEditing && canManage && confirmDeleteId === t.id && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 px-3.5 py-2.5 ring-1 ring-inset ring-red-600/10">
                      <p className="text-[13px] text-red-700">Remove {label}? Employees lose this balance.</p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => deleteType(t.id, label)}
                          disabled={deletingId === t.id}
                          isLoading={deletingId === t.id}
                        >
                          Delete
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {isEditing ? (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-[12px] font-medium text-slate-600">
                            Annual entitlement (days)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={isUnlimited ? '0' : entitlement}
                            disabled={isUnlimited}
                            onChange={(e) => setEntitlement(e.target.value)}
                            className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 text-[13px] text-slate-700">
                            <input
                              type="checkbox"
                              checked={isUnlimited}
                              onChange={(e) => setIsUnlimited(e.target.checked)}
                              className="h-4 w-4 rounded accent-cyan-600"
                            />
                            No annual cap (unlimited)
                          </label>
                          <label className="flex items-center gap-2 text-[13px] text-slate-700">
                            <input
                              type="checkbox"
                              checked={boardLevel}
                              onChange={(e) => setBoardLevel(e.target.checked)}
                              className="h-4 w-4 rounded accent-cyan-600"
                            />
                            Applies to Board &amp; C-suite only
                          </label>
                        </div>
                      </div>
                      {isUnlimited && (
                        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 ring-1 ring-amber-500/15">
                          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                          This type will apply only to Board &amp; C-suite members. Everyone else gets 0 days.
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(t.id)} disabled={saving} isLoading={saving}>
                          {saving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-[13px] text-slate-600">
                      {t.isUnlimited
                        ? 'Unlimited — no annual cap applies.'
                        : `${t.annualEntitlementDays ?? 0} days per year.`}
                      {t.appliesToBoardLevel && ' Reserved for board-level designations (CEO, C-suite, board members).'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className={`mt-6 p-5 ${CARD}`}>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
              <Info size={16} />
            </span>
            <div>
              <h3 className="text-[15px] font-bold tracking-tight text-slate-900">New joiners &amp; probation</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                Every new employee starts on probation. During probation only 1 Sick Leave day is credited; other
                leave types are not applicable. After probation ends, normal entitlements apply.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
