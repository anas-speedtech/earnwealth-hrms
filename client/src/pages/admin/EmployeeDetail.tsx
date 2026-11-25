import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserRound, IdCard, CircleDollarSign, FileText, ShieldCheck, Save, Loader2, Upload, Trash2, Link as LinkIcon, Check, RefreshCw } from 'lucide-react';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { organizationService } from '../../services/organization.service';
import {
  payrollService,
  SalaryCalculateResult,
  EmployeePayrollProfile,
  EmployeeDocumentMeta,
  EmployeeDocKind,
} from '../../services/payroll.service';
import { useAuth } from '../../contexts/AuthContext';
import type { EmployeeDetail as EmployeeRecord, Department, PersonalProfileData } from '../../services/organization.service';
import toast from 'react-hot-toast';

const PERSONAL_PROFILE_EMPTY: PersonalProfileData = {
  address: '',
  dateOfBirth: '',
  emergencyContact: '',
  personalEmail: '',
  anniversaryDate: '',
};

const ROLES_THAT_CAN_EDIT = ['SUPER_ADMIN', 'HR_ADMIN'];

type TabKey = 'personal' | 'official' | 'pf-esi' | 'salary' | 'documents';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'personal', label: 'Personal', icon: UserRound },
  { key: 'official', label: 'Official', icon: IdCard },
  { key: 'pf-esi', label: 'PF, ESI', icon: ShieldCheck },
  { key: 'salary', label: 'Salary', icon: CircleDollarSign },
  { key: 'documents', label: 'Employee Docs', icon: FileText },
];

const inr = (n: number | string | null | undefined) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('personal');

  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; employeeCode: string }[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string }[]>([]);
  const [selectedLeaveTypes, setSelectedLeaveTypes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userRole = user?.role || '';
  const canEdit = ROLES_THAT_CAN_EDIT.includes(userRole);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setIsLoading(true);
      setError(null);
      try {
        let page = 1;
        let allItems: { id: string; firstName?: string; lastName?: string; name?: string; employeeCode?: string }[] = [];
        for (;;) {
          const empPage = await organizationService.getEmployees({ page });
          const rows = empPage.data || [];
          allItems = allItems.concat(rows);
          if (page >= empPage.pagination.pages || rows.length === 0) break;
          page += 1;
        }
        const emp = await organizationService.getEmployee(id);
        const depts = await organizationService.getDepartments();
        setEmployee(emp);
        setDepartments(depts.filter((d) => d.isActive));
        let ltItems: { id: string; name: string }[] = [];
        try {
          const lts = await organizationService.getLeaveTypes();
          ltItems = lts.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }));
        } catch { /* non-critical */ }
        setLeaveTypes(ltItems);
        setEmployees(allItems
          .filter((e: { id: string }) => e.id !== id)
          .map((e: { id: string; firstName?: string; lastName?: string; name?: string; employeeCode?: string }) => ({
            id: e.id,
            name: (e.name && e.name.trim()) || ((e.firstName && e.lastName) ? `${e.firstName} ${e.lastName}` : 'Unknown'),
            employeeCode: e.employeeCode || '',
          }))
        );
      } catch {
        setError('Failed to load employee details.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [id]);

  const displayName = employee
    ? `${employee.firstName} ${employee.lastName}`.trim() || employee.employeeCode
    : (user?.email || 'Employee');

  if (isLoading) {
    return (
      <DashboardShell role={userRole} userName={user?.email || ''} userEmail={user?.email || ''} onLogout={async () => {}}>
        <div className="flex h-screen items-center justify-center"><Spinner size="md" /></div>
      </DashboardShell>
    );
  }

  if (!employee) {
    return (
      <DashboardShell role={userRole} userName={user?.email || ''} userEmail={user?.email || ''} onLogout={async () => {}}>
        <Header title="Employee Not Found" />
        <div className="p-6">
          <p className="text-[13px] text-slate-500">The requested employee could not be found.</p>
          <button onClick={() => navigate('/admin/employees')} className="mt-4 text-[13px] font-medium text-cyan-600 hover:text-cyan-700 hover:underline">Back to Employees</button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell role={userRole} userName={displayName} userEmail={employee.email || ''} onLogout={async () => {}}>
      <Header title={`${employee.firstName} ${employee.lastName}`} subtitle={employee.employeeCode} />
      <div className="p-6">
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4"><p className="text-[13px] text-red-700">{error}</p></div>
        )}

        {/* Left-side tab menu (Team → Accounts style), matching the reference layout */}
        <div className="mb-5 flex gap-6 border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative -mb-px border-b-2 px-1 pb-3 text-[13px] font-medium transition ${
                tab === t.key ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'personal' && <PersonalTab employeeId={employee.id} canEdit={canEdit} />}
        {tab === 'official' && (
          <OfficialTab
            employee={employee}
            setEmployee={setEmployee}
            departments={departments}
            employees={employees}
            leaveTypes={leaveTypes}
            selectedLeaveTypes={selectedLeaveTypes}
            setSelectedLeaveTypes={setSelectedLeaveTypes}
            canEdit={canEdit}
          />
        )}
        {tab === 'pf-esi' && <PfEsiTab employeeId={employee.id} canEdit={canEdit} />}
        {tab === 'salary' && <SalaryTab employeeId={employee.id} employeeName={`${employee.firstName} ${employee.lastName}`.trim()} canEdit={canEdit} />}
        {tab === 'documents' && <DocumentsTab employeeId={employee.id} canEdit={canEdit} />}
      </div>
    </DashboardShell>
  );
}

/* ============================ helpers shared by tabs ============================ */

const fieldInputClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10';

function Card({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-bold tracking-tight text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ReadField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-slate-600">{label}</label>
      {children || <p className="text-[13px] font-semibold text-slate-900">{value || '—'}</p>}
    </div>
  );
}

function EditableField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-slate-600">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={fieldInputClass} />
    </div>
  );
}

function EditableDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-slate-600">{label}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={fieldInputClass} />
    </div>
  );
}

function EditableSelect({ label, value, options, onChange, noneLabel }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; noneLabel?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-slate-600">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldInputClass}>
        <option value="">{noneLabel || 'Select...'}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/* ============================ 1 · PERSONAL ============================ */

function PersonalTab({ employeeId, canEdit }: { employeeId: string; canEdit: boolean }) {
  const [personal, setPersonal] = useState<PersonalProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PersonalProfileData>(PERSONAL_PROFILE_EMPTY);

  useEffect(() => {
    let mounted = true;
    organizationService.getPersonalProfile(employeeId)
      .then((p) => { if (mounted) setPersonal(p); })
      .catch(() => { if (mounted) setPersonal(PERSONAL_PROFILE_EMPTY); });
    return () => { mounted = false; };
  }, [employeeId]);

  const start = () => { setDraft(personal || PERSONAL_PROFILE_EMPTY); setEditing(true); };
  const update = (field: keyof PersonalProfileData, value: string) => setDraft((p) => ({ ...p, [field]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const saved = await organizationService.updatePersonalProfile(employeeId, draft);
      setPersonal(saved);
      setEditing(false);
      toast.success('Personal details saved.');
    } catch {
      toast.error('Could not save personal details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Personal Information"
      subtitle="Address, date of birth & contacts — maintained by HR (employee is view-only)."
      action={canEdit && !editing && <Button size="sm" onClick={start}>Edit</Button>}
    >
      {editing ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Address</label>
              <textarea value={draft.address} onChange={(e) => update('address', e.target.value)} rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] shadow-sm outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10" />
            </div>
            <EditableDate label="Date of Birth" value={draft.dateOfBirth} onChange={(v) => update('dateOfBirth', v)} />
            <EditableDate label="Anniversary Date" value={draft.anniversaryDate} onChange={(v) => update('anniversaryDate', v)} />
            <EditableField label="Emergency Contact" value={draft.emergencyContact} onChange={(v) => update('emergencyContact', v)} />
            <EditableField label="Personal Email" value={draft.personalEmail} onChange={(v) => update('personalEmail', v)} type="email" />
          </div>
          <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
            <Button onClick={save} isLoading={saving}>{saving ? 'Saving…' : 'Save Personal Details'}</Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="md:col-span-2"><ReadField label="Address" value={personal?.address || '—'} /></div>
          <ReadField label="Date of Birth" value={personal?.dateOfBirth ? formatDate(personal.dateOfBirth) : '—'} />
          <ReadField label="Anniversary Date" value={personal?.anniversaryDate ? formatDate(personal.anniversaryDate) : '—'} />
          <ReadField label="Emergency Contact" value={personal?.emergencyContact || '—'} />
          <ReadField label="Personal Email" value={personal?.personalEmail || '—'} />
        </div>
      )}
    </Card>
  );
}

/* ============================ 2 · OFFICIAL ============================ */

function OfficialTab({
  employee, setEmployee, departments, employees, leaveTypes, selectedLeaveTypes, setSelectedLeaveTypes, canEdit,
}: {
  employee: EmployeeRecord;
  setEmployee: React.Dispatch<React.SetStateAction<EmployeeRecord | null>>;
  departments: Department[];
  employees: { id: string; name: string; employeeCode: string }[];
  leaveTypes: { id: string; name: string }[];
  selectedLeaveTypes: string[];
  setSelectedLeaveTypes: React.Dispatch<React.SetStateAction<string[]>>;
  canEdit: boolean;
}) {
  const { id } = useParams<{ id: string }>();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const employmentOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
  ];

  const handleSave = async () => {
    if (!employee || !id) return;
    setIsSaving(true);
    setFormError(null);
    try {
      const payload: {
        employeeCode?: string; firstName?: string; lastName?: string; designation?: string;
        grade?: string | null; worksSaturday?: boolean; departmentId?: string; joiningDate?: string;
        status?: string; reportingManagerId?: number | null; leaveTypes?: string[];
      } = {};
      if (employee.firstName) payload.firstName = employee.firstName;
      if (employee.lastName) payload.lastName = employee.lastName;
      if (employee.employeeCode) payload.employeeCode = employee.employeeCode;
      if (employee.designation?.name) payload.designation = employee.designation.name;
      payload.grade = employee.grade?.trim() ? employee.grade : null;
      payload.worksSaturday = Boolean(employee.worksSaturday);
      payload.departmentId = employee.department?.id;
      payload.status = employee.status;
      if (employee.joiningDate) payload.joiningDate = new Date(employee.joiningDate).toISOString().split('T')[0];
      if (employee.manager?.id) payload.reportingManagerId = Number(employee.manager.id);
      if (selectedLeaveTypes.length > 0) payload.leaveTypes = selectedLeaveTypes;

      const updated = await organizationService.updateEmployee(id, payload);
      setEmployee((prev) => (prev ? { ...prev, ...(updated as EmployeeRecord) } : prev));
      setIsEditing(false);
      setSuccess('Employee updated successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update employee.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!id || !employee) return;
    setIsSaving(true);
    try {
      const result = employee.status === 'ACTIVE'
        ? await organizationService.deactivateEmployee(id)
        : await organizationService.activateEmployee(id);
      setEmployee((prev) => (prev ? { ...prev, status: result.status } : prev));
      setSuccess('Employee status updated.');
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setFormError('Failed to update employee status.');
    } finally {
      setIsSaving(false);
    }
  };

  const setField = (patch: Partial<EmployeeRecord>) => setEmployee((p) => (p ? { ...p, ...patch } : p));

  return (
    <Card
      title="Official Details"
      subtitle={`Joining, designation, department & reporting — ${employee.email}`}
      action={
        <div className="flex items-center gap-2">
          {canEdit && !isEditing && <Button size="sm" onClick={() => setIsEditing(true)}>Edit</Button>}
          {canEdit && (
            <Button size="sm" onClick={handleToggleStatus} disabled={isSaving}
              variant={employee.status === 'ACTIVE' ? 'danger' : 'secondary'}
              className={employee.status !== 'ACTIVE' ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : ''}>
              {employee.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </Button>
          )}
        </div>
      }
    >
      {success && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-700">{success}</div>}
      {formError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">{formError}</div>}

      {isEditing ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <EditableField label="Employee Code" value={employee.employeeCode} onChange={(v) => setField({ employeeCode: v })} />
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Name</label>
            <div className="flex gap-2">
              <input value={employee.firstName} onChange={(e) => setField({ firstName: e.target.value })} placeholder="First name" className={fieldInputClass} />
              <input value={employee.lastName} onChange={(e) => setField({ lastName: e.target.value })} placeholder="Last name" className={fieldInputClass} />
            </div>
          </div>
          <EditableField label="Designation" value={employee.designation?.name || ''} onChange={(v) => setField({ designation: v ? { id: '', name: v } : null })} />
          <EditableField label="Grade" value={employee.grade || ''} onChange={(v) => setField({ grade: v })} />
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Works on Saturday</label>
            <label className="flex items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={Boolean(employee.worksSaturday)}
                onChange={(e) => setField({ worksSaturday: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
              <span>Saturday is a working day (not weekly off)</span>
            </label>
          </div>
          <EditableDate label="Joining Date" value={employee.joiningDate ? new Date(employee.joiningDate).toISOString().split('T')[0] : ''} onChange={(v) => setField({ joiningDate: v })} />
          <EditableSelect label="Department" value={employee.department?.id || ''} options={departments.map((d) => ({ value: d.id, label: d.name }))}
            onChange={(v) => { const dept = departments.find((d) => d.id === v); setField({ department: dept ? { id: dept.id, name: dept.name } : null }); }} />
          <EditableSelect label="Status" value={employee.status} options={employmentOptions} onChange={(v) => setField({ status: v })} />
          <EditableSelect label="Reporting Manager" value={employee.manager?.id || ''}
            options={employees.map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})` }))}
            noneLabel="— None (top-level / founder) —"
            onChange={(v) => setField({ manager: v ? { id: v, name: employees.find((e) => e.id === v)?.name || '' } : null })} />

          {leaveTypes.length > 0 && (
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Leave Types</label>
              <p className="mb-2 text-xs text-slate-400">Select the leave types this employee is entitled to.</p>
              <div className="flex flex-wrap gap-2">
                {leaveTypes.map((lt) => {
                  const checked = selectedLeaveTypes.includes(lt.id);
                  return (
                    <label key={lt.id} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition ${checked ? 'border-cyan-300 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                      <input type="checkbox" checked={checked}
                        onChange={(e) => setSelectedLeaveTypes(e.target.checked ? [...selectedLeaveTypes, lt.id] : selectedLeaveTypes.filter((x) => x !== lt.id))}
                        className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                      {lt.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="md:col-span-2 flex items-center gap-3 border-t border-slate-100 pt-5">
            <Button onClick={handleSave} isLoading={isSaving}>{isSaving ? 'Saving…' : 'Save Changes'}</Button>
            <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <ReadField label="Employee Code" value={employee.employeeCode} />
          <ReadField label="Email" value={employee.email} />
          <ReadField label="Department" value={employee.department?.name || '—'} />
          <ReadField label="Designation" value={employee.designation?.name || '—'} />
          <ReadField label="Grade" value={employee.grade || '—'} />
          <ReadField label="Works on Saturday" value={employee.worksSaturday ? 'Yes — Saturday is a working day' : 'No — Saturday is weekly off'} />
          <ReadField label="Reporting Manager" value={employee.manager?.name || '— (top-level)'} />
          <ReadField label="Joining Date" value={formatDate(employee.joiningDate)} />
          <ReadField label="Account Status">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${employee.accountStatus === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
              {employee.accountStatus}
            </span>
          </ReadField>
        </div>
      )}
    </Card>
  );
}

/* ============================ 3 · PF & ESI ============================ */

function PfEsiTab({ employeeId, canEdit }: { employeeId: string; canEdit: boolean }) {
  const [profile, setProfile] = useState<EmployeePayrollProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pfApplicable, setPfApplicable] = useState(false);
  const [esiApplicable, setEsiApplicable] = useState(false);
  const [uan, setUan] = useState('');
  const [esicNumber, setEsicNumber] = useState('');
  const [pan, setPan] = useState('');

  useEffect(() => {
    let mounted = true;
    payrollService.getEmployeePayrollProfile(employeeId)
      .then((p) => {
        if (!mounted) return;
        setProfile(p);
        if (p) {
          setPfApplicable(Boolean(p.pfApplicable));
          setEsiApplicable(Boolean(p.esiApplicable));
          setUan(p.uan || '');
          setEsicNumber(p.esicNumber || '');
          setPan(p.pan || '');
        }
      })
      .catch(() => { if (mounted) setProfile(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [employeeId]);

  const save = async () => {
    setSaving(true);
    try {
      const payload: Partial<EmployeePayrollProfile> = { pfApplicable, esiApplicable };
      if (pfApplicable) payload.uan = uan.trim() || null;
      else payload.uan = null;
      if (esiApplicable) payload.esicNumber = esicNumber.trim() || null;
      else payload.esicNumber = null;
      payload.pan = pan.trim() || null;
      const saved = await payrollService.saveEmployeePayrollProfile(employeeId, payload);
      setProfile(saved);
      toast.success('PF / ESI details saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save PF / ESI details.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-[13px] text-slate-500"><Loader2 size={16} className="mr-2 inline animate-spin" />Loading PF / ESI details…</div>;

  return (
    <Card
      title="PF & ESI Details"
      subtitle="Statutory eligibility. Ticking PF shows the UAN field; ticking ESI shows the ESIC number."
      action={canEdit && <Button size="sm" onClick={save} disabled={saving} isLoading={saving}>{saving ? 'Saving…' : 'Save'}</Button>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={pfApplicable} onChange={(e) => setPfApplicable(e.target.checked)} disabled={!canEdit}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
            <span className="font-medium">Eligible on PF</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <input type="checkbox" checked={esiApplicable} onChange={(e) => setEsiApplicable(e.target.checked)} disabled={!canEdit}
              className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
            <span className="font-medium">Eligible on ESIC</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {pfApplicable && (
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-slate-600">UAN Number</label>
              <input value={uan} onChange={(e) => setUan(e.target.value)} disabled={!canEdit} placeholder="UAN number"
                className={`${fieldInputClass} ${pfApplicable && !uan.trim() ? 'border-amber-300' : ''}`} />
            </div>
          )}
          {esiApplicable && (
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-slate-600">ESIC Number (ESIN)</label>
              <input value={esicNumber} onChange={(e) => setEsicNumber(e.target.value)} disabled={!canEdit} placeholder="ESIC member number"
                className={`${fieldInputClass} ${esiApplicable && !esicNumber.trim() ? 'border-amber-300' : ''}`} />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-slate-600">PAN</label>
            <input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} disabled={!canEdit} placeholder="ABCDE1234F"
              className={fieldInputClass} maxLength={10} />
          </div>
        </div>

        {(!pfApplicable && !esiApplicable) && (
          <p className="text-[12px] text-slate-400">No statutory scheme is enabled for this employee. Tick PF or ESIC above to capture the number.</p>
        )}
        {profile && (
          <p className="text-[11px] text-slate-400">
            Tax regime: {profile.taxRegime || 'NEW'} · Voluntary PF rate: {profile.voluntaryPfRate || 'default'}
            {profile.salaryOnHold && ` · Salary on hold: ${profile.holdReason || ''}`}
          </p>
        )}
      </div>
    </Card>
  );
}

/* ============================ 4 · SALARY ============================ */

function SalaryTab({ employeeId, employeeName, canEdit }: { employeeId: string; employeeName: string; canEdit: boolean }) {
  const [annualCtc, setAnnualCtc] = useState('');
  const [result, setResult] = useState<SalaryCalculateResult | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const monthlyCtc = Number(annualCtc) > 0 ? Math.round((Number(annualCtc) / 12) * 100) / 100 : 0;

  const overrides = useCallback(() => {
    if (!result) return [];
    return result.components.map((c) => ({
      code: c.code,
      included: included[c.code] !== undefined ? Boolean(included[c.code]) : c.displayOnPayslip,
    }));
  }, [result, included]);

  const calculate = async () => {
    if (Number(annualCtc) <= 0) { toast.error('Enter the annual CTC first.'); return; }
    setCalculating(true);
    setNote(null);
    try {
      const r = await payrollService.calculateSalary(employeeId, Math.round((Number(annualCtc) / 12) * 100) / 100);
      setResult(r);
      // Default every row to the payhead's payslip flag.
      setIncluded(Object.fromEntries(r.components.map((c) => [c.code, c.displayOnPayslip])));
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Calculation failed.';
      setNote(msg);
      setResult(null);
    } finally {
      setCalculating(false);
    }
  };

  const saveStructure = async () => {
    if (!result) return;
    setSaving(true);
    setNote(null);
    try {
      await payrollService.calculateSalary(employeeId, result.monthlyCTC, { persist: true, overrides: overrides() });
      toast.success(`Salary structure saved for ${employeeName}.`);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not save the structure.';
      setNote(msg);
    } finally {
      setSaving(false);
    }
  };

  // Difference = entered CTC minus what the components currently sum to.
  const difference = result ? Math.round((result.monthlyCTC - result.totals.grossMonthly) * 100) / 100 : 0;

  return (
    <div className="space-y-5">
      <Card title="Salary Structure" subtitle="Enter the Annual CTC and run Calculate — components populate from the formulas set under Configuration → Calculation.">
        <div className="mb-5 flex flex-wrap items-end gap-6">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-slate-600">CTC (annual) *</label>
            <input type="number" min="0" value={annualCtc} onChange={(e) => setAnnualCtc(e.target.value)} disabled={!canEdit}
              placeholder="e.g. 660000" className={`${fieldInputClass} w-44 text-right`} />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Monthly CTC</label>
            <div className="rounded-lg bg-slate-50 px-3.5 py-2 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200">{inr(monthlyCtc)}</div>
          </div>
          <div className="flex gap-2">
            <Button onClick={calculate} disabled={!canEdit} isLoading={calculating}>
              <RefreshCw size={14} className={calculating ? 'animate-spin' : 'mr-1.5'} /> Calculate
            </Button>
            {result && canEdit && <Button variant="secondary" onClick={saveStructure} isLoading={saving}><Save size={14} className="mr-1.5" /> Save Structure</Button>}
          </div>
        </div>

        {note && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">{note}</div>}

        {result ? (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full">
                <thead className="bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 w-10"><span className="sr-only">On payslip</span></th>
                    <th className="px-4 py-2.5">Pay Component</th>
                    <th className="px-4 py-2.5">Formula</th>
                    <th className="px-4 py-2.5 text-right">Monthly</th>
                    <th className="px-4 py-2.5 text-right">Annual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.components.map((c) => (
                    <tr key={c.code} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <input type="checkbox" checked={included[c.code] !== undefined ? included[c.code] : c.displayOnPayslip}
                          disabled={!canEdit}
                          onChange={(e) => setIncluded((p) => ({ ...p, [c.code]: e.target.checked }))}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          title="Consider on the payslip" />
                      </td>
                      <td className="px-4 py-2.5 text-[13px] font-medium text-slate-900">
                        {c.name}
                        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${c.type === 'EARNING' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{c.type}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] font-mono text-slate-500">{c.formula || '0'}</td>
                      <td className="px-4 py-2.5 text-right text-[13px] text-slate-700">{inr(c.monthly)}</td>
                      <td className="px-4 py-2.5 text-right text-[13px] text-slate-700">{inr(c.annual)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 text-[13px]">
                  <tr>
                    <td className="px-4 py-2.5" colSpan={3}>
                      <span className="font-semibold text-slate-700">Totals — gross {inr(result.totals.grossMonthly)}/m · deductions {inr(result.totals.deductionsMonthly)}/m</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">{inr(result.totals.netMonthly)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">{inr(result.totals.netAnnual)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Difference Amount (CTC − components)</p>
                <p className={`text-[15px] font-bold ${Math.abs(difference) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>{inr(difference)}</p>
              </div>
              <p className="text-[12px] text-slate-400">
                Tick the box beside a component to keep it on the payslip. Set the formulas themselves under <span className="font-medium text-slate-600">Configuration → Calculation</span>.
              </p>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-[13px] text-slate-400">Enter the annual CTC and click Calculate to populate every salary component.</p>
        )}
      </Card>
    </div>
  );
}

/* ============================ 5 · DOCUMENTS ============================ */

const DOC_SLOTS: { kind: EmployeeDocKind; label: string; hint?: string }[] = [
  { kind: 'AADHAAR', label: 'Aadhar' },
  { kind: 'PAN', label: 'PAN' },
  { kind: 'ADDRESS_PROOF', label: 'Address Proof' },
  { kind: 'BANK_DETAILS', label: 'Bank Details (Cancelled Cheque)' },
  { kind: 'OTHER_1', label: 'Other Document 1' },
  { kind: 'OTHER_2', label: 'Other Document 2' },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function DocumentsTab({ employeeId, canEdit }: { employeeId: string; canEdit: boolean }) {
  const [docs, setDocs] = useState<Record<string, EmployeeDocumentMeta>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      const rows = await payrollService.listEmployeeDocuments(employeeId);
      const map: Record<string, EmployeeDocumentMeta> = {};
      rows.forEach((r) => { map[r.kind] = r; });
      setDocs(map);
    } catch {
      // Missing/failed: leave empty so the slots still render.
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const handleFile = async (kind: EmployeeDocKind, file: File) => {
    if (!canEdit) return;
    if (file.size > 1024 * 1024) {
      toast.error('File is larger than 1 MB. Compress it or pick a smaller one.');
      return;
    }
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) {
      toast.error('Only JPG, PNG, WEBP or PDF files are allowed.');
      return;
    }
    setUploading(kind);
    try {
      const dataUrl = await fileToDataUrl(file);
      await payrollService.uploadEmployeeDocument(employeeId, kind, dataUrl, file.name);
      toast.success(`${kind} document uploaded.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(null);
    }
  };

  const openDoc = async (kind: EmployeeDocKind) => {
    try {
      const doc = await payrollService.getEmployeeDocument(employeeId, kind);
      if (!doc) {
        toast.error('Document not found.');
        return;
      }
      const w = window.open('', '_blank');
      if (!w) return;
      if (doc.mimeType.startsWith('image/')) {
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${kind} — ${employeeId}</title></head><body style="margin:0;background:#f8fafc;display:grid;place-items:center;min-height:100vh"><img src="${doc.dataUrl}" style="max-width:95vw;max-height:95vh;box-shadow:0 8px 40px rgba(15,23,42,0.15)"></body></html>`);
      } else {
        w.location.href = doc.dataUrl;
      }
    } catch {
      toast.error('Could not open the document.');
    }
  };

  const removeDoc = async (kind: EmployeeDocKind) => {
    if (!canEdit) return;
    try {
      await payrollService.removeEmployeeDocument(employeeId, kind);
      toast.success(`${kind} document removed.`);
      await load();
    } catch {
      toast.error('Could not remove the document.');
    }
  };

  return (
    <Card title="Employee Documents" subtitle="Optional uploads — Aadhar, PAN, address proof, cancelled cheque and two free slots. Not mandatory.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {DOC_SLOTS.map((slot) => {
          const meta = docs[slot.kind];
          const inputRef = (el: HTMLInputElement | null) => setInputs((p) => ({ ...p, [slot.kind]: el }));
          return (
            <div key={slot.kind} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-semibold text-slate-800">{slot.label}</p>
                {meta ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    <Check size={11} /> {meta.fileName || 'Uploaded'}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-400">Not uploaded</span>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(slot.kind, f); e.target.value = ''; }}
              />
              <div className="mt-3 flex items-center gap-2">
                {canEdit && (
                  <Button size="sm" variant="secondary" disabled={uploading === slot.kind}
                    onClick={() => inputs[slot.kind]?.click()}>
                    <Upload size={13} className="mr-1.5" /> {meta ? 'Replace' : 'Upload'}
                  </Button>
                )}
                {meta && canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => void removeDoc(slot.kind)}>
                    <Trash2 size={13} className="mr-1.5" /> Remove
                  </Button>
                )}
                {meta && (
                  <Button size="sm" variant="ghost" onClick={() => void openDoc(slot.kind)}>
                    <LinkIcon size={13} className="mr-1.5" /> View
                  </Button>
                )}
                {uploading === slot.kind && <Loader2 size={14} className="animate-spin text-slate-400" />}
              </div>
            </div>
          );
        })}
      </div>
      {!canEdit && <p className="mt-4 text-[12px] text-slate-400">You can view uploaded documents; only HR Admin / Super Admin can upload or remove them.</p>}
    </Card>
  );
}
