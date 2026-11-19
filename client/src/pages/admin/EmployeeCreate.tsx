import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import { organizationService } from '../../services/organization.service';
import { leaveService, LeaveTypeItem } from '../../services/leave.service';
import { useAuth } from '../../contexts/AuthContext';

// Maternity / Paternity are not applicable to everyone, so they start
// unchecked on the opt-in list (same default the Accounts modal used).
function isMaternityOrPaternity(t: LeaveTypeItem): boolean {
  const code = (t.code || '').toUpperCase();
  const name = (t.displayName || t.name || '').toLowerCase();
  return (
    ['MAT', 'PTE', 'PAT', 'MLE'].includes(code) ||
    name.includes('maternity') ||
    name.includes('paternity')
  );
}

/**
 * THE single "Add Employee" view — opened from both the Accounts toolbar and
 * the Employee Details page. Role-aware:
 *   * Super Admin provisions an HR Admin account (POST /admin-users — the
 *     account-level path, with a mandatory login email + password).
 *   * HR Admin provisions an Employee record (POST /employees — the employee
 *     path, login optional).
 * The server enforces the same rules, so the picker always reflects what the
 * caller may actually create.
 */
export default function EmployeeCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; employeeCode: string }[]>([]);
  const [designations, setDesignations] = useState<{ id: string; name: string }[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeItem[]>([]);
  const [selectedLeaveTypes, setSelectedLeaveTypes] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState({
    employeeCode: '',
    firstName: '',
    lastName: '',
    designation: '',
    deviceEnrollNo: '',
    email: '',
    password: '',
    departmentId: '',
    joiningDate: new Date().toISOString().split('T')[0],
    status: 'ACTIVE',
    reportingManagerId: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const role: 'HR_ADMIN' | 'EMPLOYEE' = user?.role === 'SUPER_ADMIN' ? 'HR_ADMIN' : 'EMPLOYEE';
  const provisioningAdmin = role === 'HR_ADMIN';

  useEffect(() => {
    async function load() {
      try {
        const depts = await organizationService.getDepartments();
        setDepartments(depts.filter((d) => d.isActive));
      } catch {
        // Non-critical
      }
      try {
        // Fetch every page so the manager picker lists all employees, not
        // just the first 20.
        let page = 1;
        let items: { id: string; firstName?: string; lastName?: string; name?: string; employeeCode?: string }[] = [];
        for (;;) {
          const empPage = await organizationService.getEmployees({ page });
          const rows = empPage.data || [];
          items = items.concat(rows);
          if (page >= empPage.pagination.pages || rows.length === 0) break;
          page += 1;
        }
        setEmployees(items.map((e) => ({
          id: e.id,
          name: ((e.firstName || e.lastName) ? [e.firstName, e.lastName].filter(Boolean).join(' ') : '') || 'Unnamed employee',
          employeeCode: e.employeeCode || '',
        })));
      } catch {
        // Non-critical
      }
      try {
        const desigs = await organizationService.getDesignations();
        setDesignations(desigs.filter((d) => d.isActive).map((d) => ({ id: d.id, name: d.name })));
      } catch {
        // Non-critical
      }
      try {
        const list = await leaveService.getAllLeaveTypes();
        setLeaveTypes(list);
        setSelectedLeaveTypes(Object.fromEntries(list.map((t) => [t.id, !isMaternityOrPaternity(t)])));
      } catch {
        // Non-critical
      }
    }
    load();
  }, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.employeeCode.trim()) errors.employeeCode = 'Employee code is required.';
    else if (!/^\d+$/.test(form.employeeCode)) errors.employeeCode = 'Employee code must contain numbers only.';
    else if (form.employeeCode.trim().length < 3) errors.employeeCode = 'Employee code must be at least 3 digits.';
    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
    if (!form.reportingManagerId) errors.reportingManagerId = 'A reporting manager is required. Every employee must map to a higher person.';
    if (!form.designation.trim()) errors.designation = 'Designation is required.';
    // Optional legacy biometric-device slot — the employee code is the
    // identifier everywhere else, so leave it blank unless a device is paired.
    if (form.deviceEnrollNo.trim() && !/^\d+$/.test(form.deviceEnrollNo)) {
      errors.deviceEnrollNo = 'Device enrollment number must be a whole number.';
    }
    // HR Admin accounts are provisioned with a login from the start:
    if (provisioningAdmin) {
      if (!form.email.trim()) errors.email = 'Email is required for an HR Admin account.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
      if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    } else {
      // Login credentials are optional; if a password is set, the email is
      // required so the account is reachable.
      if (form.password && form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
      if (form.password && !form.email.trim()) errors.email = 'Email is required when a password is provided.';
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
    }
    if (!form.joiningDate) errors.joiningDate = 'Joining date is required.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    // Only the leave types HR checked get configured for the new employee;
    // maternity/paternity are unchecked by default so they are excluded.
    const selectedTypeIds = leaveTypes.filter((t) => selectedLeaveTypes[t.id]).map((t) => t.id);

    try {
      if (provisioningAdmin) {
        // HR Admin provisioning goes through the account endpoint (the
        // "Add HR Admin" behaviour the Accounts modal used to have).
        const managerName = employees.find((m) => m.id === form.reportingManagerId)?.name;
        await organizationService.createAdminAccount({
          name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
          email: form.email.trim(),
          password: form.password,
          role: 'HR_ADMIN',
          employeeCode: form.employeeCode,
          designation: form.designation || undefined,
          reportingManager: managerName || undefined,
          joiningDate: form.joiningDate || undefined,
          leaveTypes: selectedTypeIds,
        });
        setSuccess('HR Admin account created successfully.');
      } else {
        await organizationService.createEmployee({
          employeeCode: form.employeeCode,
          firstName: form.firstName,
          lastName: form.lastName,
          designation: form.designation,
          deviceEnrollNo: form.deviceEnrollNo.trim() || undefined,
          // Salary/allowances/deductions are configured in Payroll (salary
          // structure) — the record is created with zeroed pay fields here.
          basicSalary: '0',
          departmentId: form.departmentId || undefined,
          joiningDate: form.joiningDate,
          status: form.status,
          // Mandatory: every employee must map to a higher person.
          reportingManagerId: Number(form.reportingManagerId),
          // Optional login credentials — creates the linked user account.
          email: form.email || undefined,
          password: form.password || undefined,
          leaveTypes: selectedTypeIds,
        });
        setSuccess('Employee created successfully.');
      }
      setTimeout(() => navigate('/admin/employees'), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : provisioningAdmin ? 'Failed to create the account.' : 'Failed to create employee.';
      if (message.includes('code')) setFieldErrors((prev) => ({ ...prev, employeeCode: message }));
      else if (message.includes('department')) setFieldErrors((prev) => ({ ...prev, departmentId: message }));
      else setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <DashboardShell role={user?.role || ''} userName={user?.email || ''} userEmail={user?.email || ''} onLogout={async () => {}}>
      <Header title={provisioningAdmin ? 'Add HR Admin' : 'Add Employee'} subtitle="Create a new record" />
      <div className="p-5 sm:p-6">
        {/* Wide + centred so the full content width is used on large
            screens (matches the max-w-6xl the Accounts page uses). */}
        <div className="mx-auto w-full max-w-6xl">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-[13px] text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[13px] text-emerald-700">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <p className="text-xs text-slate-400">
              Required fields are marked <span className="text-red-500">*</span>.
              {provisioningAdmin ? ' HR Admin accounts always get a linked login.' : ''}
            </p>

            {/* Row 1: identity + date — 4 across on wide screens */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Field label="First Name *" error={fieldErrors.firstName}>
                <input type="text" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} disabled={isSubmitting} className={inputClass} />
              </Field>
              <Field label="Last Name *" error={fieldErrors.lastName}>
                <input type="text" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} disabled={isSubmitting} className={inputClass} />
              </Field>
              <Field label="Employee Code *" error={fieldErrors.employeeCode} helper="Numbers only, min 3 digits.">
                <input type="text" inputMode="numeric" value={form.employeeCode} onChange={(e) => update('employeeCode', e.target.value.replace(/\D/g, ''))} disabled={isSubmitting} className={inputClass} />
              </Field>
              <Field label="Joining Date *" error={fieldErrors.joiningDate}>
                <input type="date" value={form.joiningDate} onChange={(e) => update('joiningDate', e.target.value)} disabled={isSubmitting} className={inputClass} />
              </Field>
            </div>

            {/* Row 2: org placement — 4 across */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Field label="Designation *" error={fieldErrors.designation}>
                <select value={form.designation} onChange={(e) => update('designation', e.target.value)} disabled={isSubmitting} className={inputClass}>
                  <option value="">Select…</option>
                  {designations.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Department">
                <select value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)} disabled={isSubmitting} className={inputClass}>
                  <option value="">Select…</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Device No. (optional)" error={fieldErrors.deviceEnrollNo} helper="Only if a biometric device is paired.">
                <input type="number" min="1" step="1" value={form.deviceEnrollNo} onChange={(e) => update('deviceEnrollNo', e.target.value)} disabled={isSubmitting} className={inputClass} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => update('status', e.target.value)} disabled={isSubmitting} className={inputClass}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </Field>
            </div>

            {/* Row 3: reporting manager — long list, gives it a roomier half
                alongside a compact status note on wide screens. */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Field label="Reporting Manager *" error={fieldErrors.reportingManagerId}>
                <select value={form.reportingManagerId} onChange={(e) => update('reportingManagerId', e.target.value)} disabled={isSubmitting} className={inputClass}>
                  <option value="">Select a manager…</option>
                  {employees.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.employeeCode})</option>)}
                </select>
              </Field>
              {!provisioningAdmin && (
                <div className="flex items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-3.5 py-2 text-[12px] text-slate-400">
                  Every employee maps to a higher person, so the chain always resolves to an owner.
                </div>
              )}
            </div>

            {/* Row 4: login + leave types — side by side to use the width */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                <div className="mb-2.5 flex items-baseline justify-between gap-2">
                  <h4 className="text-[13px] font-semibold text-slate-700">
                    Login Account {provisioningAdmin ? <span className="text-red-500">*</span> : '(optional)'}
                  </h4>
                  {!provisioningAdmin && <p className="text-[11px] text-slate-400">Blank to invite later.</p>}
                </div>
                <div className="space-y-3">
                  <Field label={`Email${provisioningAdmin ? ' *' : ''}`} error={fieldErrors.email}>
                    <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} disabled={isSubmitting} className={inputClass} placeholder="name@company.com" />
                  </Field>
                  <Field label={`Password${provisioningAdmin ? ' *' : ''}`} error={fieldErrors.password} helper="Min 8 characters.">
                    <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} disabled={isSubmitting} className={inputClass} />
                  </Field>
                </div>
              </div>

              {leaveTypes.length > 0 ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                  <div className="mb-2.5 flex items-baseline justify-between gap-2">
                    <h4 className="text-[13px] font-semibold text-slate-700">Leave Types</h4>
                    <p className="text-[11px] text-slate-400">Maternity / Paternity start unchecked.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {leaveTypes.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] text-slate-700 hover:bg-white/70">
                        <input
                          type="checkbox"
                          checked={selectedLeaveTypes[t.id] ?? false}
                          onChange={(e) =>
                            setSelectedLeaveTypes((prev) => ({ ...prev, [t.id]: e.target.checked }))
                          }
                          className="h-3.5 w-3.5 rounded accent-cyan-600"
                        />
                        <span className="truncate">{t.displayName || t.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2.5 border-t border-slate-100 pt-4">
              <Button type="submit" isLoading={isSubmitting} className="min-w-[160px]">
                {isSubmitting ? 'Creating…' : provisioningAdmin ? 'Create HR Admin' : 'Create Employee'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate('/admin/employees')}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </DashboardShell>
  );
}

const inputClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:bg-slate-100';

function Field({ label, error, helper, children }: { label: string; error?: string; helper?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-slate-600">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {!error && helper && <p className="mt-1.5 text-xs text-slate-400">{helper}</p>}
    </div>
  );
}
