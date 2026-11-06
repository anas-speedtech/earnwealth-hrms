import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { organizationService } from '../../services/organization.service';
import { useAuth } from '../../contexts/AuthContext';
import type { Employee, Department, Designation, PaginatedResponse } from '../../services/organization.service';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'ON_LEAVE', label: 'On Leave' },
];

const ROLES_THAT_CAN_CREATE = ['SUPER_ADMIN', 'HR_ADMIN'];

export default function EmployeeListPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [designationFilter, setDesignationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const canCreate = ROLES_THAT_CAN_CREATE.includes(user?.role || '');

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result: PaginatedResponse<Employee> = await organizationService.getEmployees({
        page,
        search,
        departmentId: departmentFilter,
        designationId: designationFilter,
        status: statusFilter,
      });
      setEmployees(result.data);
      setTotalPages(result.pagination.pages);
    } catch {
      setError('Failed to load employees.');
    } finally {
      setIsLoading(false);
    }
  }, [page, search, departmentFilter, designationFilter, statusFilter]);

  const fetchFilters = useCallback(async () => {
    try {
      const depts = await organizationService.getDepartments();
      setDepartments(depts);
    } catch {
      setDepartments([]);
    }
    try {
      const desigs = await organizationService.getDesignations();
      setDesignations(desigs);
    } catch {
      setDesignations([]);
    }
  }, []);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEmployees();
  };

  return (
    <DashboardShell role={user?.role || ''} userName={user?.email || ''} userEmail={user?.email || ''} onLogout={async () => {}}>
      <Header title="Employee Management" subtitle={canCreate ? 'View, create, and manage employee records' : 'View employee records'} />
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)] p-5 mb-5">
          <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="employee-search" className="mb-1.5 block text-[12px] font-medium text-slate-600">Search</label>
              <input
                id="employee-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, or employee code"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
              />
            </div>
            <div>
              <label htmlFor="filter-department" className="mb-1.5 block text-[12px] font-medium text-slate-600">Department</label>
              <select
                id="filter-department"
                value={departmentFilter}
                onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
              >
                <option value="">All Departments</option>
                {departments.filter(d => d.isActive).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-designation" className="mb-1.5 block text-[12px] font-medium text-slate-600">Designation</label>
              <select
                id="filter-designation"
                value={designationFilter}
                onChange={(e) => { setDesignationFilter(e.target.value); setPage(1); }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
              >
                <option value="">All Designations</option>
                {designations.filter(d => d.isActive).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="filter-status" className="mb-1.5 block text-[12px] font-medium text-slate-600">Status</label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] text-slate-900 shadow-sm outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <Button type="submit" size="md">Search</Button>
            </div>
          </form>
        </div>

        {canCreate && (
          <div className="mb-5">
            <Link
              to="/admin/employees/new"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
            >
              + Add Employee
            </Link>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-[13px] text-red-700">{error}</p>
            <button onClick={fetchEmployees} className="mt-2 text-[13px] text-red-600 underline">Retry</button>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
            <Spinner size="md" /> Loading…
          </div>
        )}

        {!isLoading && !error && employees.length === 0 && (
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
            <EmptyState
              title="No employees found"
              description="No employees match the current search and filter criteria."
            />
          </div>
        )}

        {!isLoading && employees.length > 0 && (
          <>
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50/60">
                    <tr>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employee</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Code</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Department</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Designation</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</th>
                      <th className="border-b border-slate-100 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-[13px] font-semibold text-slate-900">{emp.firstName} {emp.lastName}</p>
                            <p className="text-xs text-slate-400">{emp.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">{emp.employeeCode}</td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">{emp.department?.name || '—'}</td>
                        <td className="px-4 py-3 text-[13px] text-slate-600">{emp.designation?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${getStatusColor(emp.status)}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link to={`/admin/employees/${emp.id}`} className="text-[13px] font-medium text-cyan-600 hover:text-cyan-700">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </Button>
                <span className="text-[13px] text-slate-600">Page {page} of {totalPages}</span>
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
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
