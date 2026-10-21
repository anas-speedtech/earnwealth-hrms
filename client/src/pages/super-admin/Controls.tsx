import { useState, useEffect } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { roleService, RoleAccess } from '../../services/role.service';
import toast from 'react-hot-toast';

export default function ControlsPage() {
  const { user, logout } = useAuth();
  const [roles, setRoles] = useState<RoleAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = user?.role === 'SUPER_ADMIN';

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        setRoles(await roleService.get());
      } catch {
        setError('Failed to load role controls.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const toggle = async (key: string, field: 'view' | 'edit', value: boolean) => {
    if (!canEdit) return;
    const current = roles.find((r) => r.key === key);
    if (!current) return;
    const next = field === 'view' ? { view: value, edit: current.edit } : { view: current.view, edit: value };
    try {
      setRoles(await roleService.update(key, next));
      toast.success(`${current.label} ${field} updated.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not update role control.');
    }
  };

  return (
    <DashboardShell role={user?.role || 'SUPER_ADMIN'} userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Controls" subtitle="View and Edit access per role, tied to the side menu" />
      <div className="p-8 max-w-3xl">
        <p className="mb-4 text-sm text-slate-500">
          Grant or remove View and Edit for each role. Super Admin and HR Admin always keep View; only Manager and
          Employee grants can be changed.
        </p>

        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {loading ? (
          <p className="text-slate-500">Loading controls…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">View</th>
                  <th className="px-4 py-3 font-medium">Edit</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const viewLocked = r.key === 'SUPER_ADMIN' || r.key === 'HR_ADMIN';
                  const editLocked = r.key === 'SUPER_ADMIN';
                  return (
                    <tr key={r.key} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700">{r.label}</p>
                        <p className="text-xs text-slate-400">{r.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Toggle
                          on={r.view}
                          locked={viewLocked || !canEdit}
                          onToggle={(v) => toggle(r.key, 'view', v)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Toggle
                          on={r.edit}
                          locked={editLocked || !canEdit}
                          onToggle={(v) => toggle(r.key, 'edit', v)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!canEdit && (
          <p className="mt-4 text-xs text-slate-400">
            You can view controls but only a Super Admin can change them.
          </p>
        )}
      </div>
    </DashboardShell>
  );
}

function Toggle({ on, locked, onToggle }: { on: boolean; locked: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!on)}
      disabled={locked}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        on ? 'bg-green-500' : 'bg-slate-300'
      } ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      aria-pressed={on}
      aria-label={on ? 'Enabled' : 'Disabled'}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
