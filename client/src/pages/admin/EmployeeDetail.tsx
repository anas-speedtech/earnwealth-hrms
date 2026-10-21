import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
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
        const [emp, depts, empPage] = await Promise.all([
          organizationService.getEmployee(id),
          organizationService.getDepartments(),
          organizationService.getEmployees({ page: 1 }),
        ]);
        setEmployee(emp);
        setDepartments(depts.filter((d) => d.isActive));
        const items = empPage.data || [];
        setEmployees(items
          .filter((e: { id: string }) => e.id !== id)
          .map((e: { id: string; firstName?: string; lastName?: string; name?: string; employeeCode?: string }) => ({
            id: e.id,
            name: (e.firstName && e.lastName) ? `${e.firstName} ${e.lastName}` : (e.name || 'Unknown'),
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
        <div className="flex items-center justify-center h-screen">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardShell>
    );
  }

  if (!employee) {
    return (
      <DashboardShell role={userRole} userName={user?.email || ''} userEmail={user?.email || ''} onLogout={async () => {}}>
        <Header title="Employee Not Found" />
        <div className="p-8">
          <p className="text-slate-500">The requested employee could not be found.</p>
          <button onClick={() => navigate('/admin/employees')} className="mt-4 text-primary-600 hover:underline">Back to Employees</button>
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
      <div className="p-8">
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

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Employee Details</h3>
            <div className="flex gap-2">
              {canEdit && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm">
                  Edit
                </button>
              )}
              {canToggleStatus && (
                <button
                  onClick={handleToggleStatus}
                  disabled={isSaving}
                  className={`px-4 py-2 rounded-lg text-sm ${employee.status === 'ACTIVE' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'} disabled:opacity-50`}
                >
                  {employee.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          </div>

          {isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

              <div className="md:col-span-2 flex gap-3 pt-4">
                <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setIsEditing(false)} className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ReadField label="Employee Code" value={employee.employeeCode} />
              <ReadField label="Email" value={employee.email} />
              <ReadField label="Account Status">
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${employee.accountStatus === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
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
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(employee.status)}`}>{employee.status}</span>
              </ReadField>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

function EditableField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
    </div>
  );
}

function EditableDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
    </div>
  );
}

function EditableSelect({ label, value, options, onChange, noneLabel }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; noneLabel?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none">
        <option value="">{noneLabel || 'Select...'}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function ReadField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-500 mb-1">{label}</label>
      {children || <p className="text-sm text-slate-900">{value || '—'}</p>}
    </div>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'bg-green-100 text-green-800';
    case 'INACTIVE': return 'bg-slate-100 text-slate-800';
    case 'SUSPENDED': return 'bg-red-100 text-red-800';
    case 'ON_LEAVE': return 'bg-yellow-100 text-yellow-800';
    default: return 'bg-slate-100 text-slate-800';
  }
}