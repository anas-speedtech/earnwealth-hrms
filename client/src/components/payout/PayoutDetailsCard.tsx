import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, History, Banknote, Pencil, Loader2, ScrollText } from 'lucide-react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import Button from '../ui/Button';
import { organizationService, PayoutDetail, PayoutHistoryEntry, PayoutLine } from '../../services/organization.service';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

// Base control styling WITHOUT a width — rows that share a line append their
// own width (flex-1 / w-28). Mixing a baked-in w-full with those classes
// makes both utilities fight and the label box gets crushed.
const inputBase =
  'h-9 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10';
const inputClass = `${inputBase} w-full`;

const money = (n: number) => formatCurrency(n || 0);

interface PayoutDetailsCardProps {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  canEdit: boolean;
}

/**
 * Payout Details — the earnings/deduction structure + bank details that feed
 * the payslip. HR enters the figures manually (automatic calculation comes
 * later); every save is gated by an explicit employee-ID confirmation and is
 * recorded in the change history and audit log.
 */
export default function PayoutDetailsCard({ employeeId, employeeCode, employeeName, canEdit }: PayoutDetailsCardProps) {
  const toast = useToast();
  const [payout, setPayout] = useState<PayoutDetail | null>(null);
  const [history, setHistory] = useState<PayoutHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Working copy used while editing (money values kept as strings in inputs).
  const [earnings, setEarnings] = useState<{ label: string; amount: string }[]>([]);
  const [deductions, setDeductions] = useState<{ label: string; amount: string }[]>([]);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  // Confirmation dialog state.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmedCode, setConfirmedCode] = useState('');

  // History dialog state.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    let mounted = true;
    organizationService
      .getPayout(employeeId)
      .then((data) => {
        if (!mounted) return;
        setPayout(data);
        // Pre-fill the edit working copy from the stored structure.
        setEarnings((data?.earnings || []).map((l) => ({ label: l.label, amount: String(l.amount || 0) })));
        setDeductions((data?.deductions || []).map((l) => ({ label: l.label, amount: String(l.amount || 0) })));
        setBankName(data?.bankName || '');
        setAccountNumber(data?.accountNumber || '');
      })
      .catch(() => {
        if (mounted) setPayout(null);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [employeeId]);

  const startEditing = () => {
    // Re-seed the working copy from the current structure so edits start clean.
    setEarnings((payout?.earnings || []).map((l) => ({ label: l.label, amount: String(l.amount || 0) })));
    setDeductions((payout?.deductions || []).map((l) => ({ label: l.label, amount: String(l.amount || 0) })));
    setBankName(payout?.bankName || '');
    setAccountNumber(payout?.accountNumber || '');
    setConfirmedCode('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setConfirmOpen(false);
    setConfirmedCode('');
  };

  // Live totals while editing (mirror the server's paise-based math).
  const editingTotals = useMemo(() => {
    const sum = (lines: { amount: string }[]) =>
      lines.reduce((acc, l) => acc + Math.max(0, Math.round((Number(l.amount) || 0) * 100)), 0) / 100;
    const grossEarnings = sum(earnings);
    const grossDeductions = sum(deductions);
    return { grossEarnings, grossDeductions, takeHome: grossEarnings - grossDeductions };
  }, [earnings, deductions]);

  const openConfirm = () => {
    setConfirmedCode('');
    setConfirmOpen(true);
  };

  const confirmCodeMatches = confirmedCode.trim().toUpperCase() === employeeCode.toUpperCase();

  const handleConfirmSave = async () => {
    if (!confirmCodeMatches) return;
    setIsSaving(true);
    try {
      const cleaned = (lines: { label: string; amount: string }[]) =>
        lines
          .filter((l) => l.label.trim())
          .map<PayoutLine>((l) => ({ label: l.label.trim(), amount: Math.max(0, Number(l.amount) || 0) }));
      const updated = await organizationService.updatePayout(employeeId, {
        earnings: cleaned(earnings),
        deductions: cleaned(deductions),
        bankName: bankName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        confirmedEmployeeCode: confirmedCode.trim(),
      });
      setPayout(updated);
      setSuccessAfterSave(updated);
      setIsEditing(false);
      setConfirmOpen(false);
      void loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save payout details.';
      toast.error(message);
      // A failed confirmation keeps the dialog open so HR can re-enter the ID.
      if (message.toLowerCase().includes('confirmation')) {
        setConfirmOpen(false);
        toast.error('Employee ID confirmation failed — nothing was saved.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const setSuccessAfterSave = (_updated: PayoutDetail) => {
    toast.success('Payout details saved. The change was recorded in the history.');
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const rows = await organizationService.getPayoutHistory(employeeId);
      setHistory(rows);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
        <div className="flex items-center justify-center gap-3 py-8 text-[13px] text-slate-500">
          <Spinner size="sm" /> Loading payout details…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <Banknote size={15} />
            </span>
            Payout Details
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Earnings & deduction structure (figures entered manually by HR) · {payout ? `v${payout.version}` : 'not set yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => { setHistoryOpen(true); void loadHistory(); }}>
            <History size={14} className="mr-1.5" /> History
          </Button>
          {canEdit && !isEditing && (
            <Button size="sm" onClick={startEditing}>
              <Pencil size={14} className="mr-1.5" /> {payout ? 'Edit' : 'Set Details'}
            </Button>
          )}
        </div>
      </div>

      <div className="p-6">
        {isEditing ? (
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Earnings */}
              <LineEditor
                title="Earnings"
                lines={earnings}
                setLines={setEarnings}
                totalLabel="Gross Earning"
                total={editingTotals.grossEarnings}
                totalTone="emerald"
              />
              {/* Deductions */}
              <LineEditor
                title="Deductions"
                lines={deductions}
                setLines={setDeductions}
                totalLabel="Gross Deductions"
                total={editingTotals.grossDeductions}
                totalTone="red"
              />
            </div>

            {/* Take home */}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-[13px] font-semibold text-slate-700">Take home</span>
              <span className="text-[15px] font-bold text-slate-900">{money(editingTotals.takeHome)}</span>
            </div>

            {/* Bank / other information */}
            <div>
              <h4 className="mb-3 text-[13px] font-semibold text-slate-700">Other Information</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Bank Name</label>
                  <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass} placeholder="e.g. ICICI Bank" />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-slate-600">A/C Number</label>
                  <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputClass} placeholder="Account number" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
              <Button onClick={openConfirm} disabled={!earnings.some((l) => l.label.trim())}>
                Save Payout Details
              </Button>
              <Button variant="secondary" onClick={cancelEditing}>
                Cancel
              </Button>
            </div>
          </div>
        ) : payout ? (
          <ReadPayout payout={payout} />
        ) : (
          <div className="py-6 text-center">
            <p className="text-[13px] text-slate-500">No payout structure is set for {employeeName} yet.</p>
            {canEdit ? (
              <Button className="mt-4" onClick={startEditing}>
                <Plus size={14} className="mr-1.5" /> Set Payout Details
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* ---- Confirmation dialog: HR must type the employee ID ---- */}
      <Modal
        isOpen={confirmOpen}
        onClose={cancelEditing}
        title="Confirm Payout Update"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={cancelEditing}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSave} disabled={!confirmCodeMatches || isSaving} isLoading={isSaving}>
              {isSaving ? 'Saving…' : 'Confirm & Save'}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-slate-600">
          Payout changes are tracked. To confirm, type the employee's ID for <span className="font-semibold text-slate-900">{employeeName}</span> — this update will be written only if the ID matches.
        </p>
        <div className="mt-4">
          <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Employee ID</label>
          <input
            autoFocus
            type="text"
            value={confirmedCode}
            onChange={(e) => setConfirmedCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && confirmCodeMatches && !isSaving) void handleConfirmSave();
            }}
            className={`${inputClass} ${confirmCodeMatches ? 'border-emerald-400 ring-emerald-100' : ''}`}
            placeholder="Type the employee ID"
          />
          <p className={`mt-1.5 text-xs ${confirmCodeMatches ? 'text-emerald-600' : 'text-slate-400'}`}>
            {confirmCodeMatches ? '✓ ID matches' : `Employee ID: ${employeeCode}`}
          </p>
        </div>
      </Modal>

      {/* ---- Change history ---- */}
      <Modal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title="Payout Change History" size="lg">
        {loadingHistory ? (
          <div className="flex items-center justify-center gap-3 py-8 text-[13px] text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Loading history…
          </div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center">
            <ScrollText size={22} className="mx-auto text-slate-300" />
            <p className="mt-2 text-[13px] text-slate-500">No changes recorded yet.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {history.map((h) => (
              <HistoryRow key={h.id} entry={h} />
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

// ---- read view: mirrors the payslip layout (Earnings | Deductions | Other) ----

function ReadPayout({ payout }: { payout: PayoutDetail }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div>
        <h4 className="text-[13px] font-semibold text-slate-700">Earnings</h4>
        <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
          {payout.earnings.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-slate-400">No earnings lines</p>
          ) : (
            payout.earnings.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-slate-600">{l.label}</span>
                <span className="text-[13px] font-medium text-slate-900">{money(l.amount)}</span>
              </div>
            ))
          )}
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2.5">
            <span className="text-[13px] font-semibold text-slate-700">Gross Earning</span>
            <span className="text-[13px] font-bold text-emerald-600">{money(payout.grossEarnings)}</span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-[13px] font-semibold text-slate-700">Deductions</h4>
        <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
          {payout.deductions.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-slate-400">No deduction lines</p>
          ) : (
            payout.deductions.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-[13px] text-slate-600">{l.label}</span>
                <span className="text-[13px] font-medium text-slate-900">{money(l.amount)}</span>
              </div>
            ))
          )}
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2.5">
            <span className="text-[13px] font-semibold text-slate-700">Gross Deductions</span>
            <span className="text-[13px] font-bold text-red-600">{money(payout.grossDeductions)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-slate-700">Take home</span>
            <span className="text-[15px] font-bold text-slate-900">{money(payout.takeHome)}</span>
          </div>
        </div>
        <div>
          <h4 className="text-[13px] font-semibold text-slate-700">Other Information</h4>
          <div className="mt-2 space-y-3 rounded-lg border border-slate-100 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bank</p>
              <p className="text-[13px] text-slate-900">{payout.bankName || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">A/C #</p>
              <p className="text-[13px] text-slate-900">{payout.accountNumber || '—'}</p>
            </div>
            {payout.updatedAt ? (
              <p className="text-[11px] text-slate-400">Last updated {formatDateTime(payout.updatedAt)}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- editable line-item column ----

function LineEditor({
  title,
  lines,
  setLines,
  totalLabel,
  total,
  totalTone,
}: {
  title: string;
  lines: { label: string; amount: string }[];
  setLines: React.Dispatch<React.SetStateAction<{ label: string; amount: string }[]>>;
  totalLabel: string;
  total: number;
  totalTone: 'emerald' | 'red';
}) {
  const update = (i: number, field: 'label' | 'amount', value: string) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  const remove = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-slate-700">{title}</h4>
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, { label: '', amount: '' }])}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-cyan-600 hover:text-cyan-700"
        >
          <Plus size={13} /> Add line
        </button>
      </div>

      <div className="space-y-2">
        {lines.length === 0 && <p className="text-[12px] text-slate-400">No {title.toLowerCase()} lines.</p>}
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={l.label}
              onChange={(e) => update(i, 'label', e.target.value)}
              placeholder="Item (e.g. BASIC)"
              className={`${inputBase} min-w-0 flex-1`}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={l.amount}
              onChange={(e) => update(i, 'amount', e.target.value)}
              placeholder="0.00"
              className={`${inputBase} w-28 shrink-0 text-right`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${l.label || 'line'}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 ${totalTone === 'emerald' ? 'bg-emerald-50' : 'bg-red-50'}`}>
        <span className="text-[13px] font-semibold text-slate-700">{totalLabel}</span>
        <span className={`text-[13px] font-bold ${totalTone === 'emerald' ? 'text-emerald-600' : 'text-red-600'}`}>{money(total)}</span>
      </div>
    </div>
  );
}

// ---- one history entry ----

function HistoryRow({ entry }: { entry: PayoutHistoryEntry }) {
  const who = [entry.actorName, entry.actorRole].filter(Boolean).join(' · ');
  return (
    <li className="rounded-lg border border-slate-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-slate-900">
          {entry.action === 'CREATED' ? 'Payout created' : 'Payout updated'} · v{entry.version}
        </p>
        <p className="text-[11px] text-slate-400">{formatDateTime(entry.createdAt)}</p>
      </div>
      <p className="mt-1 text-[12px] text-slate-500">
        By {who || '—'} · confirmed ID <span className="font-mono text-[11px] text-slate-600">{entry.confirmedCode}</span>
      </p>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-slate-500">
        {entry.before ? (
          <>
            <span className="text-slate-400 line-through">{money(entry.before ? entryBeforeTotal(entry.before) : 0)}</span>
            <span aria-hidden>→</span>
          </>
        ) : (
          <span className="text-slate-400">—</span>
        )}
        <span className="font-semibold text-slate-700">Take home {money(entry.takeHome ?? 0)}</span>
      </div>
    </li>
  );
}

/** Total take-home of a before-snapshot (earned − deducted). */
function entryBeforeTotal(s: { earnings: PayoutLine[]; deductions: PayoutLine[] }) {
  const sum = (ls: PayoutLine[]) => ls.reduce((acc, l) => acc + Math.max(0, Math.round((Number(l.amount) || 0) * 100)), 0) / 100;
  return sum(s.earnings) - sum(s.deductions);
}
