import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { organizationService } from '../../services/organization.service';
import { useAuth } from '../../contexts/AuthContext';
import type { EmployeeDetail, Department } from '../../services/organization.service';

const ROLES_THAT_CAN_EDIT = ['SUPER_ADMIN', 'HR_ADMIN'];
const ROLES_THAT_CAN_TOGGLE_STATUS = ['SUPER_ADMIN', 'HR_ADMIN'];

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; employeeCode: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const userRole = user?.role || '';
  const canEdit = ROLES_THAT_CAN_EDIT.includes(userRole);
  const canToggleStatus = ROLES_THAT_CAN_TOGGLE_STATUS.includes(userRole);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setIsLoading(true);
      setError(null);
      try {
        // The manager picker needs every employee, so walk all pages of the
        // list endpoint (server pages at 20).
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
        const items = allItems;
        setEmployees(items
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

  const handleSave = async () => {
    if (!employee || !id) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload: {
        employeeCode?: string;
        firstName?: string;
        lastName?: string;
        designation?: string;
        departmentId?: string;
        joiningDate?: string;
        basicSalary?: string;
        allowances?: string;
        deductions?: string;
        status?: string;
        reportingManagerId?: number | null;
      } = {};

      if (employee.firstName) payload.firstName = employee.firstName;
      if (employee.lastName) payload.lastName = employee.lastName;
      if (employee.employeeCode) payload.employeeCode = employee.employeeCode;
      if (employee.designation?.name) payload.designation = employee.designation.name;
      payload.departmentId = employee.department?.id;
      payload.status = employee.status;
      if (employee.joiningDate) payload.joiningDate = new Date(employee.joiningDate).toISOString().split('T')[0];
      if (employee.basicSalary !== undefined) payload.basicSalary = String(employee.basicSalary);
      if (employee.allowances !== undefined) payload.allowances = String(employee.allowances);
      if (employee.deductions !== undefined) payload.deductions = String(employee.deductions);
      // Reporting manager is mandatory and cannot be cleared.
      if (employee.manager?.id) payload.reportingManagerId = Number(employee.manager.id);
      else return setError('A reporting manager is required. Select one before saving.');

      const updated = await organizationService.updateEmployee(id, payload);
      setEmployee((prev) => (prev ? { ...prev, ...(updated as EmployeeDetail) } : prev));
      setIsEditing(false);
      setSuccess('Employee updated successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update employee.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!id || !employee) return;
    setIsSaving(true);
    setError(null);
    try {
      const isActive = employee.status === 'ACTIVE';
      const result = isActive
        ? await organizationService.deactivateEmployee(id)
        : await organizationService.activateEmployee(id);
      setEmployee((prev) => (prev ? { ...prev, status: result.status } : prev));
      setSuccess('Employee status updated.');
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('Failed to update employee status.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardShell role={userRole} userName={user?.email || ''} userEmail={user?.email || ''} onLogout={async () => {}}>
        <div className="flex h-screen items-center justify-center">
          <Spinner size="md" />
        </div>
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

  const employmentOptions = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
  ];

  return (
    <DashboardShell role={userRole} userName={user?.email || ''} userEmail={user?.email || ''} onLogout={async () => {}}>
      <Header title={`${employee.firstName} ${employee.lastName}`} subtitle={employee.employeeCode} />
      <div className="p-6">
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

        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
            <div>
              <h3 className="text-[15px] font-bold tracking-tight text-slate-900">Employee Details</h3>
              <p className="mt-0.5 text-xs text-slate-400">{employee.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {canEdit && !isEditing && (
                <Button size="sm" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              )}
              {canToggleStatus && (
                <Button
                  onClick={handleToggleStatus}
                  disabled={isSaving}
                  size="sm"
                  variant={employee.status === 'ACTIVE' ? 'danger' : 'secondary'}
                  className={employee.status !== 'ACTIVE' ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : ''}
                >
                  {employee.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </Button>
              )}
            </div>
          </div>

          <div className="p-6">
          {isEditing ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <EditableField label="Employee Code" value={employee.employeeCode} onChange={(v) => setEmployee((p) => (p ? { ...p, employeeCode: v } : p))} />
              <EditableField label="First Name" value={employee.firstName} onChange={(v) => setEmployee((p) => (p ? { ...p, firstName: v } : p))} />
              <EditableField label="Last Name" value={employee.lastName} onChange={(v) => setEmployee((p) => (p ? { ...p, lastName: v } : p))} />
              <EditableField label="Designation" value={employee.designation?.name || ''} onChange={(v) => setEmployee((p) => (p ? { ...p, designation: v ? { id: '', name: v } : null } : p))} />
              <EditableField label="Basic Salary" value={String(employee.basicSalary ?? '')} onChange={(v) => setEmployee((p) => (p ? { ...p, basicSalary: v } : p))} />
              <EditableField label="Allowances" value={String(employee.allowances ?? '')} onChange={(v) => setEmployee((p) => (p ? { ...p, allowances: v } : p))} />
              <EditableField label="Deductions" value={String(employee.deductions ?? '')} onChange={(v) => setEmployee((p) => (p ? { ...p, deductions: v } : p))} />
              <EditableDate label="Joining Date" value={employee.joiningDate ? new Date(employee.joiningDate).toISOString().split('T')[0] : ''} onChange={(v) => setEmployee((p) => (p ? { ...p, joiningDate: v } : p))} />
              <EditableSelect
                label="Department"
                value={employee.department?.id || ''}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                onChange={(v) => {
                  const dept = departments.find((d) => d.id === v);
                  setEmployee((p) => (p ? { ...p, department: dept ? { id: dept.id, name: dept.name } : null } : p));
                }}
              />
              <EditableSelect
                label="Status"
                value={employee.status}
                options={employmentOptions}
                onChange={(v) => setEmployee((p) => (p ? { ...p, status: v } : p))}
              />
              <EditableSelect
                label="Reporting Manager"
                value={employee.manager?.id || ''}
                options={employees.map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode})` }))}
                noneLabel="— None —"
                onChange={(v) => setEmployee((p) => (p ? { ...p, manager: v ? { id: v, name: employees.find((e) => e.id === v)?.name || '' } : null } : p))}
              />

              <div className="md:col-span-2 flex items-center gap-3 border-t border-slate-100 pt-5">
                <Button onClick={handleSave} isLoading={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <ReadField label="Employee Code" value={employee.employeeCode} />
              <ReadField label="Email" value={employee.email} />
              <ReadField label="Account Status">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${employee.accountStatus === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                  {employee.accountStatus}
                </span>
              </ReadField>
              <ReadField label="Department" value={employee.department?.name || '—'} />
              <ReadField label="Designation" value={employee.designation?.name || '—'} />
              <ReadField label="Reporting Manager" value={employee.manager?.name || '—'} />
              <ReadField label="Basic Salary" value={String(employee.basicSalary ?? '—')} />
              <ReadField label="Allowances" value={String(employee.allowances ?? '—')} />
              <ReadField label="Deductions" value={String(employee.deductions ?? '—')} />
              <ReadField label="Joining Date" value={new Date(employee.joiningDate).toLocaleDateString()} />
              <ReadField label="Status">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${getStatusColor(employee.status)}`}>{employee.status}</span>
              </ReadField>
            </div>
          )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

const fieldInputClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10';

function EditableField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-slate-600">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={fieldInputClass} />
    </div>
  );
}

function EditableDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-slate-600">{label}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={fieldInputClass} />
    </div>
  );
}

function EditableSelect({ label, value, options, onChange, noneLabel }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; noneLabel?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-slate-600">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldInputClass}>
        <option value="">{noneLabel || 'Select...'}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
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

function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'INACTIVE': return 'bg-slate-100 text-slate-600 ring-slate-200';
    case 'SUSPENDED': return 'bg-red-50 text-red-700 ring-red-200';
    case 'ON_LEAVE': return 'bg-amber-50 text-amber-700 ring-amber-200';
    default: return 'bg-slate-100 text-slate-600 ring-slate-200';
  }
}