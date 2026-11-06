import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import { organizationService } from '../../services/organization.service';
import { useAuth } from '../../contexts/AuthContext';

export default function EmployeeCreatePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; employeeCode: string }[]>([]);
  const [designations, setDesignations] = useState<{ id: string; name: string }[]>([]);

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
    }
    load();
  }, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.employeeCode.trim()) errors.employeeCode = 'Employee code is required.';
    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
    if (!form.reportingManagerId) errors.reportingManagerId = 'A reporting manager is required. Every employee must map to a higher person.';
    if (!form.designation.trim()) errors.designation = 'Designation is required.';
    if (!form.deviceEnrollNo.trim()) errors.deviceEnrollNo = 'Device enrollment number is required.';
    else if (!/^\d+$/.test(form.deviceEnrollNo)) errors.deviceEnrollNo = 'Device enrollment number must be a whole number.';
    // Login credentials are optional; if a password is set, the email is
    // required so the account is reachable.
    if (form.password && form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (form.password && !form.email.trim()) errors.email = 'Email is required when a password is provided.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
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

    try {
      await organizationService.createEmployee({
        employeeCode: form.employeeCode,
        firstName: form.firstName,
        lastName: form.lastName,
        designation: form.designation,
        deviceEnrollNo: form.deviceEnrollNo,
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
      });
      setSuccess('Employee created successfully.');
      setTimeout(() => navigate('/admin/employees'), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create employee.';
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
      <Header title="Add Employee" subtitle="Create a new employee record" />
      <div className="p-6">
        <div className="max-w-2xl">
          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-[13px] text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[13px] text-emerald-700">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <div>
              <h3 className="text-[15px] font-bold tracking-tight text-slate-900">Employee Information</h3>
              <p className="mt-0.5 text-xs text-slate-400">Fields marked required must be completed before saving.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="First Name" error={fieldErrors.firstName}>
                <input type="text" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} disabled={isSubmitting} className={inputClass} />
              </Field>
              <Field label="Last Name" error={fieldErrors.lastName}>
                <input type="text" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} disabled={isSubmitting} className={inputClass} />
              </Field>
            </div>

            <Field label="Employee Code" error={fieldErrors.employeeCode} helper="Unique identifier used for attendance devices.">
              <input type="text" value={form.employeeCode} onChange={(e) => update('employeeCode', e.target.value)} disabled={isSubmitting} className={inputClass} />
            </Field>

            <Field label="Designation" error={fieldErrors.designation}>
              <select value={form.designation} onChange={(e) => update('designation', e.target.value)} disabled={isSubmitting} className={inputClass}>
                <option value="">Select designation…</option>
                {designations.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Device Enrollment Number" error={fieldErrors.deviceEnrollNo} helper="Whole number only.">
                <input type="number" min="1" step="1" value={form.deviceEnrollNo} onChange={(e) => update('deviceEnrollNo', e.target.value)} disabled={isSubmitting} className={inputClass} />
              </Field>
              <Field label="Department">
                <select value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)} disabled={isSubmitting} className={inputClass}>
                  <option value="">Select Department</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            </div>

            <div>
              <h4 className="mb-3 text-[13px] font-semibold text-slate-700">Login Account</h4>
              <p className="mb-3 text-xs text-slate-400">
                Optional — set an email and password so the employee can sign in immediately. Leave blank to invite them later.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Email" error={fieldErrors.email}>
                  <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} disabled={isSubmitting} className={inputClass} placeholder="name@company.com" />
                </Field>
                <Field label="Password" error={fieldErrors.password} helper="At least 8 characters.">
                  <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} disabled={isSubmitting} className={inputClass} />
                </Field>
              </div>
            </div>

            <div>
              <label htmlFor="manager-select" className="mb-1.5 block text-[12px] font-medium text-slate-600">Reporting Manager (required)</label>
              <select id="manager-select" value={form.reportingManagerId} onChange={(e) => update('reportingManagerId', e.target.value)} disabled={isSubmitting} className={inputClass}>
                <option value="">Select a manager…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employeeCode})</option>)}
              </select>
              {fieldErrors.reportingManagerId && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.reportingManagerId}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Joining Date" error={fieldErrors.joiningDate}>
                <input type="date" value={form.joiningDate} onChange={(e) => update('joiningDate', e.target.value)} disabled={isSubmitting} className={inputClass} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => update('status', e.target.value)} disabled={isSubmitting} className={inputClass}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </Field>
            </div>

            <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
              <Button type="submit" isLoading={isSubmitting} className="min-w-[180px]">
                {isSubmitting ? 'Creating...' : 'Create Employee'}
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