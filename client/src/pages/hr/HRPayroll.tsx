import { useState, useEffect, useCallback } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { payrollService, SalaryStructureItem, SalaryComponentItem, PayrollRecordItem } from '../../services/payroll.service';
import { organizationService, Employee } from '../../services/organization.service';
import toast from 'react-hot-toast';

type Tab = 'salary-structures' | 'prepare-payroll' | 'review';

const PAYROLL_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;

export default function HRPayrollPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('prepare-payroll');

  // Salary Structures
  const [structures, setStructures] = useState<SalaryStructureItem[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedStructure, setSelectedStructure] = useState<SalaryStructureItem | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);

  // Employees for search
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeResults, setEmployeeResults] = useState<Employee[]>([]);
  const [_departments, _setDepartments] = useState<unknown[]>([]);

  // Structure form
  const [showStructureForm, setShowStructureForm] = useState(false);
  const [editingStructure, setEditingStructure] = useState<SalaryStructureItem | null>(null);
  const [structureFormData, setStructureFormData] = useState({
    monthlyCTC: '',
    currency: 'INR',
    effectiveFrom: '',
    effectiveTo: '',
  });
  const [structureComponents, setStructureComponents] = useState<SalaryComponentItem[]>([]);
  const [structureSaving, setStructureSaving] = useState(false);

  // Payroll Preparation
  const [payrollMonth, setPayrollMonth] = useState(new Date().getMonth() + 1);
  const [payrollYear, setPayrollYear] = useState(new Date().getFullYear());
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecordItem[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollFilter, setPayrollFilter] = useState('');
  const [payrollStatusFilter, setPayrollStatusFilter] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [_editingComponentsId, _setEditingComponentsId] = useState<string | null>(null);

  // Fetch salary structure when employee selected
  useEffect(() => {
    if (!selectedEmployee) {
      setSelectedStructure(null);
      return;
    }
    setStructureLoading(true);
    payrollService
      .getSalaryStructure(selectedEmployee.id)
      .then(setSelectedStructure)
      .catch(() => setSelectedStructure(null))
      .finally(() => setStructureLoading(false));
  }, [selectedEmployee]);

  // Search employees
  useEffect(() => {
    if (!employeeSearch || employeeSearch.length < 2) {
      setEmployeeResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await organizationService.getEmployees({ search: employeeSearch, page: 1 });
        setEmployeeResults(result.data);
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [employeeSearch]);

  // Fetch payroll records
  const fetchPayrollRecords = useCallback(async () => {
    setPayrollLoading(true);
    try {
      const params: Record<string, unknown> = { month: payrollMonth, year: payrollYear };
      if (payrollFilter) params.search = payrollFilter;
      if (payrollStatusFilter) params.status = payrollStatusFilter;
      const result = await payrollService.listPayrolls(params);
      setPayrollRecords(result.payrolls);
    } catch {
      toast.error('Failed to load payroll records.');
    } finally {
      setPayrollLoading(false);
    }
  }, [payrollMonth, payrollYear, payrollFilter, payrollStatusFilter]);

  useEffect(() => {
    if (activeTab === 'prepare-payroll') {
      fetchPayrollRecords();
    }
  }, [activeTab, fetchPayrollRecords]);

  // Fetch salary structures list
  const fetchStructures = useCallback(async () => {
    setStructureLoading(true);
    try {
      const result = await payrollService.listSalaryStructures({ page: 1 });
      setStructures(result.structures);
    } catch {
      toast.error('Failed to load salary structures.');
    } finally {
      setStructureLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'salary-structures') {
      fetchStructures();
    }
  }, [activeTab, fetchStructures]);

  // Create/update salary structure
  const handleSaveStructure = async () => {
    if (!selectedEmployee) return;
    const ctc = parseFloat(structureFormData.monthlyCTC);
    if (!ctc || ctc <= 0) {
      toast.error('Monthly CTC must be a positive number.');
      return;
    }

    setStructureSaving(true);
    try {
      const validComponents = structureComponents.filter(
        (c) => c.name.trim() && c.type && c.amount && parseFloat(c.amount) > 0
      );

      if (editingStructure) {
        await payrollService.updateSalaryStructure(editingStructure.id, {
          monthlyCTC: ctc,
          currency: structureFormData.currency,
          effectiveFrom: structureFormData.effectiveFrom || undefined,
          effectiveTo: structureFormData.effectiveTo || null,
        });
        toast.success('Salary structure updated.');
      } else {
        await payrollService.createSalaryStructure({
          employeeId: selectedEmployee.id,
          monthlyCTC: ctc,
          currency: structureFormData.currency,
          isActive: true,
          effectiveFrom: structureFormData.effectiveFrom || new Date().toISOString().split('T')[0],
          effectiveTo: structureFormData.effectiveTo || null,
          components: validComponents.map((c) => ({
            name: c.name,
            description: c.description ?? undefined,
            type: c.type,
            calculationType: c.calculationType || 'FIXED',
            amount: parseFloat(c.amount),
            percentage: c.percentage,
            formula: c.formula,
            sortOrder: c.sortOrder || 0,
            isActive: c.isActive ?? true,
          })),
        });
        toast.success('Salary structure created.');
      }

      setShowStructureForm(false);
      setEditingStructure(null);
      setSelectedEmployee(null);
      setSelectedStructure(null);
      setStructureComponents([]);
      setStructureFormData({ monthlyCTC: '', currency: 'INR', effectiveFrom: '', effectiveTo: '' });
      if (activeTab === 'salary-structures') fetchStructures();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to save.';
      toast.error(message);
    } finally {
      setStructureSaving(false);
    }
  };

  // Bulk create payroll
  const handleBulkCreate = async () => {
    try {
      const result = await organizationService.getEmployees({ page: 1, status: 'ACTIVE' });
      const activeEmployees = result.data.filter((e) => e.id !== selectedEmployee?.id);
      if (activeEmployees.length === 0) {
        toast.error('No active employees found.');
        return;
      }
      await payrollService.bulkCreatePayroll({
        employeeIds: activeEmployees.map((e) => e.id),
        month: payrollMonth,
        year: payrollYear,
      });
      toast.success(`Payroll created for ${activeEmployees.length} employees.`);
      fetchPayrollRecords();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to create payroll.';
      toast.error(message);
    }
  };

  // Submit payroll for approval
  const handleSubmit = async (payrollId: string) => {
    setSubmittingId(payrollId);
    try {
      await payrollService.submitForApproval(payrollId);
      toast.success('Payroll submitted for approval.');
      fetchPayrollRecords();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Failed to submit.';
      toast.error(message);
    } finally {
      setSubmittingId(null);
    }
  };

  // Add component row to form
  const addComponentRow = () => {
    setStructureComponents([
      ...structureComponents,
      {
        id: `new-${Date.now()}`,
        name: '',
        description: null,
        type: 'EARNING',
        calculationType: 'FIXED',
        amount: '',
        percentage: null,
        formula: null,
        sortOrder: structureComponents.length,
        isActive: true,
      },
    ]);
  };

  const updateComponent = (index: number, field: keyof SalaryComponentItem, value: string | boolean) => {
    const updated = [...structureComponents];
    updated[index] = { ...updated[index], [field]: value };
    setStructureComponents(updated);
  };

  const removeComponent = (index: number) => {
    setStructureComponents(structureComponents.filter((_, i) => i !== index));
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      DRAFT: 'bg-slate-100 text-slate-700',
      PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
      APPROVED: 'bg-green-100 text-green-700',
      REJECTED: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-slate-100 text-slate-700'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const formatCurrency = (val: string) => {
    if (!val) return '—';
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Structure form modal
  const renderStructureForm = () => {
    if (!showStructureForm || !selectedEmployee) return null;
    const isEditing = !!editingStructure;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">
              {isEditing ? 'Edit Salary Structure' : 'New Salary Structure'}
            </h3>
            <button
              onClick={() => {
                setShowStructureForm(false);
                setEditingStructure(null);
                setSelectedEmployee(null);
                setStructureComponents([]);
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Employee:</span>{' '}
                {selectedEmployee.firstName} {selectedEmployee.lastName} ({selectedEmployee.employeeCode})
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monthly CTC (INR)</label>
                <input
                  type="number"
                  value={structureFormData.monthlyCTC}
                  onChange={(e) => setStructureFormData({ ...structureFormData, monthlyCTC: e.target.value })}
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                <select
                  value={structureFormData.currency}
                  onChange={(e) => setStructureFormData({ ...structureFormData, currency: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Effective From</label>
                <input
                  type="date"
                  value={structureFormData.effectiveFrom}
                  onChange={(e) => setStructureFormData({ ...structureFormData, effectiveFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Effective To (optional)</label>
                <input
                  type="date"
                  value={structureFormData.effectiveTo}
                  onChange={(e) => setStructureFormData({ ...structureFormData, effectiveTo: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Salary Components */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">Salary Components</label>
                <button
                  onClick={addComponentRow}
                  className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  + Add Component
                </button>
              </div>
              {structureComponents.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No components added. The backend will create default components if none are provided.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {structureComponents.map((comp, idx) => (
                    <div key={comp.id} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg">
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={comp.name}
                          onChange={(e) => updateComponent(idx, 'name', e.target.value)}
                          placeholder="Name"
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <select
                          value={comp.type}
                          onChange={(e) => updateComponent(idx, 'type', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none"
                        >
                          <option value="EARNING">Earning</option>
                          <option value="DEDUCTION">Deduction</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={comp.amount}
                          onChange={(e) => updateComponent(idx, 'amount', e.target.value)}
                          placeholder="Amount"
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={comp.description || ''}
                          onChange={(e) => updateComponent(idx, 'description', e.target.value)}
                          placeholder="Description"
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                      <div className="col-span-2 text-right">
                        <button
                          onClick={() => removeComponent(idx)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              onClick={() => {
                setShowStructureForm(false);
                setEditingStructure(null);
                setSelectedEmployee(null);
              }}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveStructure}
              disabled={structureSaving}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {structureSaving ? 'Saving...' : isEditing ? 'Update' : 'Create Structure'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardShell
      role="HR_ADMIN"
      userName={(user?.profile?.firstName && user?.profile?.lastName)
        ? `${user.profile.firstName} ${user.profile.lastName}`
        : user?.email || 'HR_ADMIN'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Payroll Management" subtitle="Salary structures and payroll preparation" />
      <div className="p-8">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6">
          {[
            { key: 'salary-structures', label: 'Salary Structures' },
            { key: 'prepare-payroll', label: 'Payroll Preparation' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as Tab)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'salary-structures' && (
          <div className="space-y-6">
            {/* Employee Search */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Select Employee</h3>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Search by name or employee code..."
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {selectedEmployee && (
                  <div className="text-sm text-slate-600">
                    Selected: <span className="font-medium">{selectedEmployee.firstName} {selectedEmployee.lastName}</span>
                    <button
                      onClick={() => {
                        setSelectedEmployee(null);
                        setSelectedStructure(null);
                        setEmployeeSearch('');
                      }}
                      className="ml-2 text-red-500 text-xs hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              {employeeResults.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                  {employeeResults.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => {
                        setSelectedEmployee(emp);
                        setEmployeeSearch('');
                        setEmployeeResults([]);
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    >
                      <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                      <span className="text-slate-400 ml-2">{emp.employeeCode}</span>
                      <span className="text-slate-400 ml-2 text-xs">({emp.email})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Structure */}
            {selectedEmployee && (
              <div className="bg-white rounded-xl border border-slate-200">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Salary Structure</h3>
                  <button
                    onClick={() => {
                      setEditingStructure(selectedStructure);
                      setStructureFormData({
                        monthlyCTC: selectedStructure?.monthlyCTC || '',
                        currency: selectedStructure?.currency || 'INR',
                        effectiveFrom: selectedStructure?.effectiveFrom || '',
                        effectiveTo: selectedStructure?.effectiveTo || '',
                      });
                      setStructureComponents(selectedStructure?.components || []);
                      setShowStructureForm(true);
                    }}
                    className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                  >
                    {selectedStructure ? 'Edit Structure' : 'Create Structure'}
                  </button>
                </div>
                {structureLoading ? (
                  <div className="p-8 text-center text-slate-500">Loading...</div>
                ) : selectedStructure ? (
                  <div className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div>
                        <p className="text-xs font-medium text-slate-500">Monthly CTC</p>
                        <p className="text-lg font-bold text-slate-900">{formatCurrency(selectedStructure.monthlyCTC)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500">Currency</p>
                        <p className="text-sm text-slate-900">{selectedStructure.currency}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500">Status</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          selectedStructure.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {selectedStructure.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500">Effective From</p>
                        <p className="text-sm text-slate-900">{selectedStructure.effectiveFrom}</p>
                      </div>
                    </div>
                    {selectedStructure.effectiveTo && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-slate-500">Effective To</p>
                        <p className="text-sm text-slate-900">{selectedStructure.effectiveTo}</p>
                      </div>
                    )}
                    {selectedStructure.components.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-slate-700 mb-2">Components</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Calculation</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {selectedStructure.components.map((comp) => (
                                <tr key={comp.id}>
                                  <td className="px-4 py-3 text-sm text-slate-900">
                                    {comp.name}
                                    {comp.description && <p className="text-xs text-slate-400">{comp.description}</p>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                      comp.type === 'EARNING' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                      {comp.type}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-600">{comp.calculationType}</td>
                                  <td className="px-4 py-3 text-sm text-slate-900 text-right">{formatCurrency(comp.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8">
                    <p className="text-sm text-slate-500 mb-2">No salary structure found for this employee.</p>
                    <button
                      onClick={() => {
                        setEditingStructure(null);
                        setStructureFormData({ monthlyCTC: '', currency: 'INR', effectiveFrom: '', effectiveTo: '' });
                        setStructureComponents([]);
                        setShowStructureForm(true);
                      }}
                      className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                    >
                      Create Structure
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* All Structures List */}
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900">All Salary Structures</h3>
              </div>
              {structureLoading ? (
                <div className="p-8 text-center text-slate-500">Loading...</div>
              ) : structures.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No salary structures found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Employee</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">CTC</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Effective From</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Effective To</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {structures.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-900">Employee: {s.employeeId}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{formatCurrency(s.monthlyCTC)}</td>
                          <td className="px-6 py-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              s.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {s.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{s.effectiveFrom}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{s.effectiveTo || '—'}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedEmployee({ id: s.employeeId } as Employee);
                                setSelectedStructure(s);
                              }}
                              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {renderStructureForm()}
          </div>
        )}

        {activeTab === 'prepare-payroll' && (
          <div className="space-y-6">
            {/* Period Selection */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
                  <select
                    value={payrollMonth}
                    onChange={(e) => setPayrollMonth(parseInt(e.target.value))}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {monthNames.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
                  <input
                    type="number"
                    value={payrollYear}
                    onChange={(e) => setPayrollYear(parseInt(e.target.value) || 2025)}
                    className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    min="2000"
                    max="2100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Status</label>
                  <select
                    value={payrollStatusFilter}
                    onChange={(e) => setPayrollStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">All</option>
                    {PAYROLL_STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={handleBulkCreate}
                    className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700"
                  >
                    Create All Active
                  </button>
                </div>
              </div>
            </div>

            {/* Payroll Records */}
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Payroll Records — {monthNames[payrollMonth - 1]} {payrollYear}</h3>
                <input
                  type="text"
                  value={payrollFilter}
                  onChange={(e) => setPayrollFilter(e.target.value)}
                  placeholder="Filter records..."
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {payrollLoading ? (
                <div className="p-8 text-center text-slate-500">Loading...</div>
              ) : payrollRecords.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No payroll records for this period. Click "Create All Active" to generate them.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Employee ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Gross Earnings</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Deductions</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Net Pay</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {payrollRecords.map((record) => (
                        <tr key={record.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-900 font-mono">{record.employeeId}</td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              {statusBadge(record.status)}
                              {record.rejectionReason && (
                                <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded truncate max-w-[200px]" title={record.rejectionReason}>
                                  Rejected: {record.rejectionReason}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatCurrency(record.grossEarnings)}</td>
                          <td className="px-6 py-4 text-sm text-slate-600 text-right">{formatCurrency(record.totalDeductions)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900 text-right">{formatCurrency(record.netPay)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const el = document.getElementById(`components-${record.id}`);
                                  el?.classList.toggle('hidden');
                                }}
                                className="text-xs text-primary-600 hover:text-primary-700"
                              >
                                Details
                              </button>
                              {record.status === 'DRAFT' && (
                                <button
                                  onClick={() => {
                                    if (confirm('Submit this payroll for Super Admin approval?')) {
                                      handleSubmit(record.id);
                                    }
                                  }}
                                  disabled={submittingId === record.id}
                                  className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                  {submittingId === record.id ? '...' : 'Submit'}
                                </button>
                              )}
                              {record.status === 'APPROVED' && (
                                <span className="text-xs text-green-600">Locked</span>
                              )}
                            </div>
                            {/* Component Detail */}
                            <div id={`components-${record.id}`} className="hidden mt-2 bg-slate-50 rounded-lg p-3">
                              <p className="text-xs font-medium text-slate-500 mb-2">Salary Components</p>
                              <div className="space-y-1">
                                {record.components.map((comp) => (
                                  <div key={comp.id} className="flex justify-between text-xs">
                                    <span className="text-slate-700">{comp.name}</span>
                                    <span className="text-slate-600">{formatCurrency(comp.amount)}</span>
                                  </div>
                                ))}
                              </div>
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
        )}
      </div>
    </DashboardShell>
  );
}
