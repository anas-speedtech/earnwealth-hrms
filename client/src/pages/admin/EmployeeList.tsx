import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../components/layout/Header';
import DashboardShell from '../../components/layout/DashboardShell';
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

const ROLES_THAT_CAN_CREATE = ['SUPER_ADMIN', 'ADMIN', 'HR'];

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
      <div className="p-8">
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-700 mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, or employee code"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
              <select
                value={departmentFilter}
                onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">All Departments</option>
                {departments.filter(d => d.isActive).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
              <select
                value={designationFilter}
                onChange={(e) => { setDesignationFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">All Designations</option>
                {designations.filter(d => d.isActive).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              Search
            </button>
          </form>
        </div>

        {canCreate && (
          <div className="mb-4">
            <Link to="/admin/employees/new" className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              + Add Employee
            </Link>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={fetchEmployees} className="mt-2 text-sm text-red-600 underline">Retry</button>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && !error && employees.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">No employees found matching your criteria.</p>
          </div>
        )}

        {!isLoading && employees.length > 0 && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Employee</th>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Code</th>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Department</th>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Designation</th>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Status</th>
                      <th className="text-left px-6 py-3 text-sm font-medium text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{emp.firstName} {emp.lastName}</p>
                            <p className="text-sm text-slate-500">{emp.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{emp.employeeCode}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{emp.department?.name || '—'}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{emp.designation?.name || '—'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(emp.status)}`}>
                            {emp.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link to={`/admin/employees/${emp.id}`} className="text-sm text-primary-600 hover:text-primary-700">
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
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                >
                  Next
                </button>
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
    case 'ACTIVE': return 'bg-green-100 text-green-800';
    case 'INACTIVE': return 'bg-slate-100 text-slate-800';
    case 'SUSPENDED': return 'bg-red-100 text-red-800';
    case 'ON_LEAVE': return 'bg-yellow-100 text-yellow-800';
    default: return 'bg-slate-100 text-slate-800';
  }
}
