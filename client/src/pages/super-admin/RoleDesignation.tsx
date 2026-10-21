import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { organizationService, Designation } from '../../services/organization.service';
import { roleService, RoleAccess } from '../../services/role.service';
import toast from 'react-hot-toast';

type Tab = 'role' | 'designation';

// Sub-menu selection is read from the query string (?tab=designation) so the
// Designations sub-menu in the sidebar can deep-link straight to it.
function initialTab(): Tab {
  const params = new URLSearchParams(window.location.search);
  return params.get('tab') === 'designation' ? 'designation' : 'role';
}

export default function RoleDesignationPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(initialTab);

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';
  const canEditGrants = user?.role === 'SUPER_ADMIN'; // only Super Admin edits View/Edit

  // ---- roles ----
  const [roles, setRoles] = useState<RoleAccess[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roleView, setRoleView] = useState(true);
  const [roleEdit, setRoleEdit] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  // ---- designations ----
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [desigLoading, setDesigLoading] = useState(true);
  const [desigError, setDesigError] = useState<string | null>(null);

  const [showDesigForm, setShowDesigForm] = useState(false);
  const [editingDesigId, setEditingDesigId] = useState<string | null>(null);
  const [desigName, setDesigName] = useState('');
  const [desigDesc, setDesigDesc] = useState('');
  const [desigActive, setDesigActive] = useState(true);
  const [desigFieldError, setDesigFieldError] = useState<string | null>(null);
  const [desigSubmitting, setDesigSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setRolesLoading(true);
      setRolesError(null);
      try {
        setRoles(await roleService.get());
      } catch {
        setRolesError('Failed to load role access.');
      } finally {
        if (mounted) setRolesLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setDesigLoading(true);
      setDesigError(null);
      try {
        setDesignations(await organizationService.getDesignations());
      } catch {
        setDesigError('Failed to load designations.');
      } finally {
        if (mounted) setDesigLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const switchTab = (next: Tab) => {
    setTab(next);
    const path = next === 'designation' ? '/super-admin/user-roles?tab=designation' : '/super-admin/user-roles';
    navigate(path, { replace: true });
  };

  // When the Designation sub-menu in the sidebar is clicked the route gains
  // ?tab=designation, but if the page is already mounted the above state was
  // captured on mount only — sync it from the URL on every location change.
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setTab(params.get('tab') === 'designation' ? 'designation' : 'role');
  }, [location.search]);

  // ---- role grant save ----
  const beginEditRole = (r: RoleAccess) => {
    setEditingRole(r.key);
    setRoleView(r.view);
    setRoleEdit(r.edit);
  };

  const saveRoleGrant = async (key: string) => {
    setSavingRole(true);
    try {
      const updated = await roleService.update(key, { view: roleView, edit: roleEdit });
      setRoles(updated);
      setEditingRole(null);
      toast.success('Role access updated.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not save role access.');
    } finally {
      setSavingRole(false);
    }
  };

  // ---- designation CRUD ----
  const resetDesigForm = () => {
    setDesigName('');
    setDesigDesc('');
    setDesigActive(true);
    setEditingDesigId(null);
    setDesigFieldError(null);
    setShowDesigForm(false);
  };

  const openDesigEdit = (d: Designation) => {
    setEditingDesigId(d.id);
    setDesigName(d.name);
    setDesigDesc(d.description || '');
    setDesigActive(d.isActive);
    setDesigFieldError(null);
    setShowDesigForm(true);
  };

  const submitDesig = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!desigName.trim()) {
      setDesigFieldError('Designation name is required.');
      return;
    }
    setDesigSubmitting(true);
    setDesigFieldError(null);
    try {
      if (editingDesigId) {
        await organizationService.updateDesignation(editingDesigId, {
          name: desigName.trim(),
          description: desigDesc.trim(),
          isActive: desigActive,
        });
        toast.success('Designation updated.');
      } else {
        await organizationService.createDesignation({
          name: desigName.trim(),
          description: desigDesc.trim(),
          isActive: desigActive,
        });
        toast.success('Designation created.');
      }
      resetDesigForm();
      setDesignations(await organizationService.getDesignations());
    } catch (err: unknown) {
      setDesigFieldError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setDesigSubmitting(false);
    }
  };

  const deleteDesig = async (d: Designation) => {
    if (!confirm(`Delete the designation "${d.name}"? This cannot be undone.`)) return;
    try {
      await organizationService.deleteDesignation(d.id);
      toast.success('Designation deleted.');
      setDesignations(await organizationService.getDesignations());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  return (
    <DashboardShell role={user?.role || 'SUPER_ADMIN'} userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Role & Designation" subtitle="Manage access levels and job designations" />
      <div className="p-8 max-w-6xl">
        {/* Sub-menu: Role | Designation */}
        <div className="mb-6 flex gap-6 border-b border-slate-200">
          {([['role', 'Role'], ['designation', 'Designation']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition ${
                tab === key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'role' ? (
          <RoleTab
            roles={roles}
            loading={rolesLoading}
            error={rolesError}
            canManage={canManage}
            canEditGrants={canEditGrants}
            editingRole={editingRole}
            roleView={roleView}
            roleEdit={roleEdit}
            saving={savingRole}
            beginEdit={beginEditRole}
            setView={setRoleView}
            setEdit={setRoleEdit}
            save={saveRoleGrant}
          />
        ) : (
          <DesignationTab
            designations={designations}
            loading={desigLoading}
            error={desigError}
            canManage={canManage}
            showForm={showDesigForm}
            setShowForm={setShowDesigForm}
            name={desigName}
            setName={setDesigName}
            desc={desigDesc}
            setDesc={setDesigDesc}
            active={desigActive}
            setActive={setDesigActive}
            fieldError={desigFieldError}
            submitting={desigSubmitting}
            submit={submitDesig}
            openEdit={openDesigEdit}
            remove={deleteDesig}
            resetForm={resetDesigForm}
          />
        )}
      </div>
    </DashboardShell>
  );
}

// ---------------------------------------------------------------- Role tab
function RoleTab(props: {
  roles: RoleAccess[];
  loading: boolean;
  error: string | null;
  canManage: boolean;
  canEditGrants: boolean;
  editingRole: string | null;
  roleView: boolean;
  roleEdit: boolean;
  saving: boolean;
  beginEdit: (r: RoleAccess) => void;
  setView: (v: boolean) => void;
  setEdit: (v: boolean) => void;
  save: (key: string) => void;
}) {
  const {
    roles, loading, error, canManage, canEditGrants,
    editingRole, roleView, roleEdit, saving,
    beginEdit, setView, setEdit, save,
  } = props;

  const lockedView = (k: string) => k === 'SUPER_ADMIN' || k === 'HR_ADMIN';
  const lockedEdit = (k: string) => k === 'SUPER_ADMIN';

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Access levels and the View / Edit grants each holds. Super Admin and HR Admin always keep View; only Manager /
        Employee grants can be changed.
      </p>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="text-slate-500">Loading roles…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">View</th>
                <th className="px-4 py-3 font-medium">Edit</th>
                {canEditGrants && <th className="px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const isEditing = editingRole === r.key;
                const viewLocked = lockedView(r.key);
                const editLocked = lockedEdit(r.key);
                return (
                  <tr key={r.key} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-700">{r.label}</td>
                    <td className="px-4 py-3 text-slate-500">{r.description}</td>
                    <td className="px-4 py-3">
                      {isEditing && canEditGrants ? (
                        <label className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={roleView} disabled={viewLocked} onChange={(e) => setView(e.target.checked)} />
                          View
                        </label>
                      ) : (
                        <GrantBadge on={r.view} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing && canEditGrants ? (
                        <label className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={roleEdit} disabled={editLocked} onChange={(e) => setEdit(e.target.checked)} />
                          Edit
                        </label>
                      ) : (
                        <GrantBadge on={r.edit} />
                      )}
                    </td>
                    {canEditGrants && (
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => save(r.key)}
                              disabled={saving}
                              className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        ) : (
                          (viewLocked && editLocked) ? (
                            <span className="text-xs text-slate-400">Locked</span>
                          ) : (
                            <button onClick={() => beginEdit(r)} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                              Edit
                            </button>
                          )
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!canManage && null}
    </div>
  );
}

function GrantBadge({ on }: { on: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
      on ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
    }`}>
      {on ? 'Granted' : '—'}
    </span>
  );
}

// ------------------------------------------------------- Designation tab
function DesignationTab(props: {
  designations: Designation[];
  loading: boolean;
  error: string | null;
  canManage: boolean;
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  name: string;
  setName: (v: string) => void;
  desc: string;
  setDesc: (v: string) => void;
  active: boolean;
  setActive: (v: boolean) => void;
  fieldError: string | null;
  submitting: boolean;
  submit: (e: React.FormEvent) => void;
  openEdit: (d: Designation) => void;
  remove: (d: Designation) => void;
  resetForm: () => void;
}) {
  const {
    designations, loading, error, canManage,
    showForm, setShowForm, name, setName, desc, setDesc, active, setActive,
    fieldError, submitting, submit, openEdit, remove, resetForm,
  } = props;

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Designations are job titles (Software Engineer, Manager, CTO, …) that can be assigned to employees. They do
        not grant login privileges; account access is managed separately in User Management.
      </p>

      {canManage && (
        <div className="mb-4">
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
              showForm
                ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {showForm ? (
              <span className="inline-flex items-center gap-1"><Pencil size={14} /> Close</span>
            ) : (
              <span className="inline-flex items-center gap-1"><Plus size={14} /> New Designation</span>
            )}
          </button>
        </div>
      )}

      {showForm && canManage && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">{name ? 'Designation' : 'New Designation'}</h3>
          {fieldError && <p className="mb-3 text-sm text-red-600">{fieldError}</p>}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Software Engineer"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                rows={2}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What this designation does"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading designations…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Employees</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canManage && <th className="px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {designations.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-700">{d.name}</td>
                  <td className="px-4 py-3 text-slate-500">{d.description || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{d.employeeCount}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${d.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${d.isActive ? 'bg-green-500' : 'bg-slate-400'}`} />
                      {d.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(d)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        {d.employeeCount === 0 ? (
                          <button
                            onClick={() => remove(d)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm transition hover:bg-red-50"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        ) : (
                          <button
                            disabled
                            title="Deactivate instead of deleting a designation in use"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed"
                          >
                            <Trash2 size={13} /> In use
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

