import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
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

  const [form, setForm] = useState({
    employeeCode: '',
    firstName: '',
    lastName: '',
    designation: '',
    deviceEnrollNo: '',
    basicSalary: '',
    allowances: '',
    deductions: '',
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
        const empPage = await organizationService.getEmployees({ page: 1 });
        const items = empPage.data || [];
        setEmployees(items.map((e: { id: string; firstName?: string; lastName?: string; name?: string; employeeCode?: string }) => ({
          id: e.id,
          name: (e.firstName && e.lastName) ? `${e.firstName} ${e.lastName}` : (e.name || 'Unknown'),
          employeeCode: e.employeeCode || '',
        })));
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
    if (!form.designation.trim()) errors.designation = 'Designation is required.';
    if (!form.deviceEnrollNo.trim()) errors.deviceEnrollNo = 'Device enrollment number is required.';
    else if (!/^\d+$/.test(form.deviceEnrollNo)) errors.deviceEnrollNo = 'Device enrollment number must be a whole number.';
    if (!form.basicSalary.trim()) errors.basicSalary = 'Basic salary is required.';
    else if (Number.isNaN(Number(form.basicSalary)) || Number(form.basicSalary) < 0) errors.basicSalary = 'Basic salary must be a non-negative number.';
    if (form.allowances && (Number.isNaN(Number(form.allowances)) || Number(form.allowances) < 0)) errors.allowances = 'Allowances must be a non-negative number.';
    if (form.deductions && (Number.isNaN(Number(form.deductions)) || Number(form.deductions) < 0)) errors.deductions = 'Deductions must be a non-negative number.';
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
        basicSalary: form.basicSalary,
        allowances: form.allowances || undefined,
        deductions: form.deductions || undefined,
        departmentId: form.departmentId || undefined,
        joiningDate: form.joiningDate,
        status: form.status,
        reportingManagerId: form.reportingManagerId ? Number(form.reportingManagerId) : undefined,
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
      <div className="p-8">
        <div className="max-w-2xl">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="First Name" error={fieldErrors.firstName}>
                <input type="text" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100" />
              </Field>
              <Field label="Last Name" error={fieldErrors.lastName}>
                <input type="text" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100" />
              </Field>
            </div>

            <Field label="Employee Code" error={fieldErrors.employeeCode}>
              <input type="text" value={form.employeeCode} onChange={(e) => update('employeeCode', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100" />
            </Field>

            <Field label="Designation" error={fieldErrors.designation}>
              <input type="text" value={form.designation} onChange={(e) => update('designation', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100" />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Device Enrollment Number" error={fieldErrors.deviceEnrollNo}>
                <input type="number" min="1" step="1" value={form.deviceEnrollNo} onChange={(e) => update('deviceEnrollNo', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100" />
              </Field>
              <Field label="Basic Salary" error={fieldErrors.basicSalary}>
                <input type="number" min="0" step="0.01" value={form.basicSalary} onChange={(e) => update('basicSalary', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100" />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Allowances" error={fieldErrors.allowances}>
                <input type="number" min="0" step="0.01" value={form.allowances} onChange={(e) => update('allowances', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100" />
              </Field>
              <Field label="Deductions" error={fieldErrors.deductions}>
                <input type="number" min="0" step="0.01" value={form.deductions} onChange={(e) => update('deductions', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100" />
              </Field>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <select value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100">
                <option value="">Select Department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reporting Manager</label>
              <select value={form.reportingManagerId} onChange={(e) => update('reportingManagerId', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100">
                <option value="">— None —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employeeCode})</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Joining Date" error={fieldErrors.joiningDate}>
                <input type="date" value={form.joiningDate} onChange={(e) => update('joiningDate', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100" />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => update('status', e.target.value)} disabled={isSubmitting} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none disabled:bg-slate-100">
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </Field>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
                {isSubmitting ? 'Creating...' : 'Create Employee'}
              </button>
              <button type="button" onClick={() => navigate('/admin/employees')} className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardShell>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}