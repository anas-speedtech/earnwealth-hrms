import { useEffect, useMemo, useState } from 'react';
import { History, Banknote, Pencil, Loader2, ScrollText } from 'lucide-react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import Button from '../ui/Button';
import { organizationService, PayoutDetail, PayoutHistoryEntry, PayoutLine } from '../../services/organization.service';
import { useToast } from '../../contexts/ToastContext';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

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
 * Payout Details — the Annual CTC and Deductions that feed the payslip.
 * Exactly two fields, entered by HR; every save is gated by an explicit
 * employee-ID confirmation and recorded in the change history + audit log.
 *
 * The figures are persisted as a single earnings line ("Annual CTC") and a
 * single deductions line ("Deductions") in the underlying payout store, so
 * existing multi-line structures are migrated forward on the next save.
 * Bank details are kept hidden but carried through on save so they are not
 * wiped when the card is edited.
 */
export default function PayoutDetailsCard({ employeeId, employeeCode, employeeName, canEdit }: PayoutDetailsCardProps) {
  const toast = useToast();
  const [payout, setPayout] = useState<PayoutDetail | null>(null);
  const [history, setHistory] = useState<PayoutHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // The two editable fields. Money values stay as strings in the inputs.
  const [annualCTC, setAnnualCTC] = useState('');
  const [deductions, setDeductions] = useState('');
  // Bank details are not shown in this card but are retained on save.
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  // Confirmation dialog state.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmedCode, setConfirmedCode] = useState('');

  // History dialog state.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Sum the stored earnings/deduction lines into the single Annual CTC value.
  const toScalar = (data: PayoutDetail | null, key: 'earnings' | 'deductions') => {
    if (!data) return '';
    const total = data[key].reduce((acc, l) => acc + Math.round((Number(l.amount) || 0) * 100), 0) / 100;
    return total ? String(total) : '';
  };

  useEffect(() => {
    let mounted = true;
    organizationService
      .getPayout(employeeId)
      .then((data) => {
        if (!mounted) return;
        setPayout(data);
        seedFrom(data);
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

  const seedFrom = (data: PayoutDetail | null) => {
    setAnnualCTC(toScalar(data, 'earnings'));
    setDeductions(toScalar(data, 'deductions'));
    setBankName(data?.bankName || '');
    setAccountNumber(data?.accountNumber || '');
  };

  const startEditing = () => {
    seedFrom(payout);
    setConfirmedCode('');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setConfirmOpen(false);
    setConfirmedCode('');
  };

  const takeHome = useMemo(() => {
    const ctc = Math.max(0, Math.round((Number(annualCTC) || 0) * 100)) / 100;
    const ded = Math.max(0, Math.round((Number(deductions) || 0) * 100)) / 100;
    return ctc - ded;
  }, [annualCTC, deductions]);

  const openConfirm = () => {
    setConfirmedCode('');
    setConfirmOpen(true);
  };

  const confirmCodeMatches = confirmedCode.trim().toUpperCase() === employeeCode.toUpperCase();

  const handleConfirmSave = async () => {
    if (!confirmCodeMatches) return;
    setIsSaving(true);
    try {
      // Two fields persisted as one line each. A zero line is still stored so
      // the "not set yet" state is replaced by an explicit value.
      const ctc = Math.max(0, Number(annualCTC) || 0);
      const ded = Math.max(0, Number(deductions) || 0);
      const earnings: PayoutLine[] = [{ label: 'Annual CTC', amount: ctc }];
      const dedLines: PayoutLine[] = ded > 0 ? [{ label: 'Deductions', amount: ded }] : [];
      const updated = await organizationService.updatePayout(employeeId, {
        earnings,
        deductions: dedLines,
        bankName: bankName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        confirmedEmployeeCode: confirmedCode.trim(),
      });
      setPayout(updated);
      toast.success('Payout details saved. The change was recorded in the history.');
      setIsEditing(false);
      setConfirmOpen(false);
      void loadHistory();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save payout details.';
      toast.error(message);
      if (message.toLowerCase().includes('confirmation')) {
        setConfirmOpen(false);
        toast.error('Employee ID confirmation failed — nothing was saved.');
      }
    } finally {
      setIsSaving(false);
    }
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
            Annual CTC & deductions (entered manually by HR) · {payout ? `v${payout.version}` : 'not set yet'}
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
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Annual CTC</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={annualCTC}
                  onChange={(e) => setAnnualCTC(e.target.value)}
                  placeholder="0.00"
                  className={`${inputClass} text-right`}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Deductions</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deductions}
                  onChange={(e) => setDeductions(e.target.value)}
                  placeholder="0.00"
                  className={`${inputClass} text-right`}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-[13px] font-semibold text-slate-700">Take home</span>
              <span className="text-[15px] font-bold text-slate-900">{money(takeHome)}</span>
            </div>

            <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
              <Button onClick={openConfirm}>
                Save Payout Details
              </Button>
              <Button variant="secondary" onClick={cancelEditing}>
                Cancel
              </Button>
            </div>
          </div>
        ) : payout ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-100 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Annual CTC</p>
              <p className="mt-1 text-[15px] font-bold text-slate-900">{money(payout.grossEarnings)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Deductions</p>
              <p className="mt-1 text-[15px] font-bold text-red-600">{money(payout.grossDeductions)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-slate-700">Take home</span>
                <span className="text-[15px] font-bold text-slate-900">{money(payout.takeHome)}</span>
              </div>
            </div>
            {payout.updatedAt ? (
              <p className="text-[11px] text-slate-400 sm:col-span-2">Last updated {formatDateTime(payout.updatedAt)}</p>
            ) : null}
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-[13px] text-slate-500">No payout is set for {employeeName} yet.</p>
            {canEdit ? (
              <Button className="mt-4" onClick={startEditing}>
                Set Payout Details
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
      <div className="mt-2 text-[12px] text-slate-500">
        <span className="font-semibold text-slate-700">Take home {money(entry.takeHome ?? 0)}</span>
      </div>
    </li>
  );
}
