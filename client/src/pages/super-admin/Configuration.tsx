import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import RoleControlPanel from '../../components/RoleControlPanel';
import { useAuth } from '../../contexts/AuthContext';
import { payrollService, SalaryPayhead, SalaryRules } from '../../services/payroll.service';
import { previewSalarySplitLocal } from '../../utils/salary';
import { formatCurrency } from '../../utils/formatters';
import toast from 'react-hot-toast';

const CARD =
  'rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20';

type TabKey = 'role-control' | 'salary-components' | 'calculation';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'role-control', label: 'Role Control' },
  { key: 'salary-components', label: 'Salary Components' },
  { key: 'calculation', label: 'Calculation' },
];

export default function ConfigurationPage() {
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>('calculation');
  const [payheads, setPayheads] = useState<SalaryPayhead[]>([]);
  const [payheadsLoading, setPayheadsLoading] = useState(true);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Admin';

  // Keep the tab in sync with the ?tab= query so the Configuration sub-menu
  // items in the sidebar deep-link correctly.
  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    const known: TabKey[] = ['role-control', 'salary-components', 'calculation'];
    setTab(fromUrl && (known as string[]).includes(fromUrl) ? (fromUrl as TabKey) : 'calculation');
  }, [searchParams]);

  const selectTab = (next: TabKey) => {
    setTab(next);
    setSearchParams(next === 'calculation' ? {} : { tab: next }, { replace: true });
  };

  useEffect(() => {
    let mounted = true;
    payrollService.listPayheads({ activeOnly: false })
      .then((rows) => { if (mounted) setPayheads(rows); })
      .catch(() => { if (mounted) setPayheads([]); })
      .finally(() => { if (mounted) setPayheadsLoading(false); });
    return () => { mounted = false; };
  }, []);

  return (
    <DashboardShell role={user?.role || 'SUPER_ADMIN'} userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Configuration" subtitle="Role control, salary components and the salary calculation engine" />
      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* Left-side menu, matching the Accounts screen layout */}
        <div className="mb-6 flex flex-wrap gap-6 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => selectTab(t.key)}
              className={`-mb-px border-b-2 px-1 pb-3 text-[13px] font-medium transition ${
                tab === t.key ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'role-control' && (
          <div className={CARD}>
            <h3 className="mb-1 text-[15px] font-semibold text-slate-900">Role Control</h3>
            <p className="mb-4 text-[12px] text-slate-500">Per-role View / Edit access, tied to the side menu.</p>
            <RoleControlPanel />
          </div>
        )}

        {tab === 'salary-components' && (
          <SalaryComponentsPanel
            payheads={payheads}
            loading={payheadsLoading}
            onChanged={() => payrollService.listPayheads({ activeOnly: false }).then(setPayheads).catch(() => {})}
          />
        )}

        {tab === 'calculation' && (
          <CalculationPanel payheads={payheads} onFormulaSaved={() => payrollService.listPayheads({ activeOnly: false }).then(setPayheads).catch(() => {})} />
        )}
      </div>
    </DashboardShell>
  );
}

/* ---------------- Salary Components (payhead catalog) ---------------- */

function SalaryComponentsPanel({ payheads, loading, onChanged }: { payheads: SalaryPayhead[]; loading: boolean; onChanged: () => void }) {
  const [form, setForm] = useState({ code: '', name: '', type: 'EARNING' as 'EARNING' | 'DEDUCTION', description: '', formula: '', sortOrder: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast.error('Payhead code and name are required.'); return; }
    setSaving(true);
    try {
      await payrollService.createPayhead({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || undefined,
        formula: form.formula.trim() || undefined,
        sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
      });
      toast.success('Salary component added.');
      setForm({ code: '', name: '', type: 'EARNING', description: '', formula: '', sortOrder: '' });
      onChanged();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Could not add the component.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (payhead: SalaryPayhead) => {
    await payrollService.updatePayhead(payhead.id, { isActive: !payhead.isActive }).then(onChanged).catch(() => toast.error('Could not update the component.'));
  };

  const handleDelete = async (payhead: SalaryPayhead) => {
    if (!confirm(`Deactivate "${payhead.name}"? Existing salary structures are not affected.`)) return;
    await payrollService.deletePayhead(payhead.id).then(onChanged).catch(() => toast.error('Could not remove the component.'));
  };

  if (loading) return <div className="py-12 text-center text-[13px] text-slate-500"><Spinner size="md" /></div>;

  return (
    <div className="space-y-5">
      <div className={CARD}>
        <h3 className="mb-1 text-[15px] font-semibold text-slate-900">Add a Salary Component</h3>
        <p className="mb-4 text-[12px] text-slate-500">Components offered when building a salary structure. The formula feeds the Calculate action on the Salary tab.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <input placeholder="Code (e.g. LTA)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} />
          <div className="md:col-span-2"><input placeholder="Name (e.g. Leave Travel Allowance)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'EARNING' | 'DEDUCTION' })} className={inputCls}>
            <option value="EARNING">Earning</option>
            <option value="DEDUCTION">Deduction</option>
          </select>
          <input placeholder="Sort" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className={inputCls} />
          <button onClick={handleCreate} disabled={saving} className="flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-cyan-700 disabled:opacity-50">
            <Plus size={14} /> {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      <div className={CARD}>
        <h3 className="mb-3 text-[15px] font-semibold text-slate-900">Salary Components ({payheads.length})</h3>
        {payheads.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-slate-400">No salary components configured yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payheads.map((h) => (
                  <tr key={h.id} className={`hover:bg-slate-50/60 ${!h.isActive ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-mono text-[13px] text-slate-700">{h.code}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-900">
                      {h.name}
                      {h.description && <p className="text-xs text-slate-400">{h.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${h.type === 'EARNING' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{h.type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${h.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{h.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => handleToggle(h)} className="text-xs font-medium text-cyan-600 hover:text-cyan-700">{h.isActive ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={() => handleDelete(h)} className="text-xs font-medium text-red-500 hover:text-red-700"><Trash2 size={13} className="inline" /> Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Calculation (payhead formulas + salary rules) ---------------- */

function CalculationPanel({ payheads, onFormulaSaved }: { payheads: SalaryPayhead[]; onFormulaSaved: () => void }) {
  const [rules, setRules] = useState<SalaryRules | null>(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [previewCtc, setPreviewCtc] = useState('600000');
  const [formulaDrafts, setFormulaDrafts] = useState<Record<string, string>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    payrollService.getSalaryRules()
      .then((r) => { if (mounted) setRules(r); })
      .catch(() => { if (mounted) setRules(null); })
      .finally(() => { if (mounted) setRulesLoading(false); });
    return () => { mounted = false; };
  }, []);

  // Seed the editable formula drafts from the loaded payheads.
  useEffect(() => {
    setFormulaDrafts((prev) => {
      const next = { ...prev };
      for (const p of payheads) {
        if (!(p.id in next)) next[p.id] = p.formula || '';
      }
      return next;
    });
  }, [payheads]);

  const setRuleField = (field: keyof SalaryRules, value: number | string) =>
    setRules((prev) => (prev ? { ...prev, [field]: value } : prev));

  const handleSaveRules = async () => {
    if (!rules) return;
    setRulesSaving(true);
    try {
      setRules(await payrollService.updateSalaryRules(rules));
      toast.success('Calculation configuration saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the configuration.');
    } finally {
      setRulesSaving(false);
    }
  };

  const handleSaveFormula = async (payhead: SalaryPayhead) => {
    setSavingCode(payhead.id);
    try {
      await payrollService.updatePayhead(payhead.id, { formula: (formulaDrafts[payhead.id] || '').trim() || null });
      toast.success(`Formula saved for ${payhead.name}.`);
      // Refresh the catalog so the Salary tab picks up the new formula.
      onFormulaSaved();
    } catch (err) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Could not save the formula.';
      toast.error(message);
    } finally {
      setSavingCode(null);
    }
  };

  const rulesPreview = rules ? previewSalarySplitLocal(Number(previewCtc) || 0, rules) : null;

  return (
    <div className="space-y-5">
      {/* 1 · Payhead formulas — the Calculate action on the Salary tab evaluates these */}
      <div className={CARD}>
        <h3 className="mb-1 text-[15px] font-semibold text-slate-900">Component Formulas</h3>
        <p className="mb-4 text-[12px] text-slate-500">
          Each component's formula — e.g. <code className="rounded bg-slate-100 px-1 text-[11px]">CTC*50%</code> — is what the
          Calculate action on an employee's Salary tab evaluates. You can reference <b>CTC</b>, <b>MONTHLY_CTC</b>,
          <b> ANNUAL_CTC</b> and the other component names. A blank formula means a fixed 0-amount line.
        </p>
        {payheads.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-slate-400">Add salary components first (Salary Components tab), then set their formulas here.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {payheads.map((h) => (
              <div key={h.id} className="flex items-center gap-3 py-2.5">
                <div className="w-56 shrink-0">
                  <p className="text-[13px] font-medium text-slate-900">{h.name}</p>
                  <p className="text-[11px] text-slate-400">{h.code} · {h.type}</p>
                </div>
                <input
                  value={formulaDrafts[h.id] ?? h.formula ?? ''}
                  onChange={(e) => setFormulaDrafts((p) => ({ ...p, [h.id]: e.target.value }))}
                  placeholder="e.g. CTC*50%  (blank = fixed 0)"
                  className={`${inputCls} flex-1 font-mono`}
                />
                <Button size="sm" variant="secondary" disabled={savingCode === h.id} onClick={() => handleSaveFormula(h)}>
                  {savingCode === h.id ? 'Saving…' : 'Save'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2 · Standard split rules (Basic/HRA/PF/ESIC/PT) + live preview */}
      <div className={CARD}>
        <h3 className="mb-1 text-[15px] font-semibold text-slate-900">Standard Split</h3>
        <p className="mb-4 text-[12px] text-slate-500">
          Used when a salary structure is auto-generated: Basic, HRA, Provident Fund, ESIC and Profession Tax.
        </p>
        {rulesLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-10 text-[13px] text-slate-500"><Spinner size="sm" /> Loading…</div>
        ) : rules ? (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {([
                ['basicPct', 'Basic (% of CTC)'],
                ['hraPctOfBasic', 'HRA (% of Basic)'],
                ['pfPct', 'PF (%)'],
                ['pfCap', 'PF Cap (on Basic)'],
                ['esicEmployerPct', 'ESI Employer (%)'],
                ['esicEmployeePct', 'ESI Employee (%)'],
                ['esicWageCeiling', 'ESI Wage Ceiling'],
                ['professionTax', 'Profession Tax (₹)'],
              ] as [keyof SalaryRules, string][]).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1 block text-[12px] font-medium text-slate-600">{label}</label>
                  <input type="number" step="0.01" value={(rules[key] as number) ?? 0} onChange={(e) => setRuleField(key, Number(e.target.value))} className={inputCls} />
                </div>
              ))}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-[12px] font-medium text-slate-600">Notes (printed on the payslip)</label>
              <textarea value={rules.notes} onChange={(e) => setRuleField('notes', e.target.value)} rows={2} className={inputCls} />
            </div>

            <div className="mt-5 rounded-lg border border-cyan-200 bg-cyan-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="text-[12px] font-medium text-slate-600">Preview split for CTC ₹ <input type="number" value={previewCtc} onChange={(e) => setPreviewCtc(e.target.value)} className="ml-1 w-40 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-cyan-500" /></label>
                {rulesPreview && (
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Net Pay</p>
                    <p className="text-[20px] font-bold text-emerald-700">{formatCurrency(rulesPreview.netPay)}</p>
                  </div>
                )}
              </div>
              {rulesPreview ? (
                <div className="grid grid-cols-1 gap-4 text-[12px] md:grid-cols-2">
                  <div>
                    <p className="mb-1 font-medium text-emerald-700">Earnings</p>
                    {rulesPreview.earnings.map((e) => (
                      <div key={e.code} className="flex justify-between py-0.5"><span>{e.name}</span><span className="font-medium">{formatCurrency(e.amount)}</span></div>
                    ))}
                    <div className="mt-1 border-t border-emerald-200 pt-1 flex justify-between font-semibold"><span>Total Earnings</span><span>{formatCurrency(rulesPreview.grossEarnings)}</span></div>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-red-700">Deductions</p>
                    {rulesPreview.deductions.map((d) => (
                      <div key={d.code} className="flex justify-between py-0.5"><span>{d.name}</span><span className="font-medium">{formatCurrency(d.amount)}</span></div>
                    ))}
                    <div className="mt-1 border-t border-red-200 pt-1 flex justify-between font-semibold"><span>Total Deductions</span><span>{formatCurrency(rulesPreview.totalDeductions)}</span></div>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-slate-500">Enter a CTC amount to preview the split.</p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <Button onClick={handleSaveRules} disabled={rulesSaving}><RefreshCw size={13} className={rulesSaving ? 'animate-spin mr-1.5' : 'mr-1.5'} /> {rulesSaving ? 'Saving…' : 'Save Calculation Settings'}</Button>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-[13px] text-slate-400">No calculation configuration found.</p>
        )}
      </div>
    </div>
  );
}
