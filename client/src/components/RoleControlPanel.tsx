import { useState, useEffect } from 'react';
import { roleService, RoleAccess } from '../services/role.service';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import StatusBadge from './shared/StatusBadge';
import Spinner from './ui/Spinner';

const CARD =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]';

/**
 * The per-role View/Edit grant table (the old "Controls" screen), extracted
 * so it can render both standalone and as a tab inside the Configuration
 * page ("Role Control").
 */
export default function RoleControlPanel() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = user?.role === 'SUPER_ADMIN';

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

  if (error) return <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700 ring-1 ring-inset ring-red-100">{error}</p>;
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-slate-500">
        <Spinner size="md" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-slate-500">
        Grant or remove View and Edit for each role. Super Admin and HR Admin always keep View; only Manager and
        Employee grants can be changed.
      </p>
      <div className={`overflow-x-auto ${CARD}`}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">View</th>
              <th className="px-4 py-3">Edit</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => {
              const viewLocked = r.key === 'SUPER_ADMIN' || r.key === 'HR_ADMIN';
              const editLocked = r.key === 'SUPER_ADMIN';
              return (
                <tr key={r.key} className="border-t border-slate-100 text-[13px] hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{r.label}</p>
                    <p className="text-xs text-slate-400">{r.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Toggle on={r.view} locked={viewLocked || !canEdit} onToggle={(v) => toggle(r.key, 'view', v)} />
                      {viewLocked && <StatusBadge tone="slate">Locked</StatusBadge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Toggle on={r.edit} locked={editLocked || !canEdit} onToggle={(v) => toggle(r.key, 'edit', v)} />
                      {editLocked && <StatusBadge tone="slate">Locked</StatusBadge>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!canEdit && (
        <p className="text-xs text-slate-400">
          You can view controls but only a Super Admin can change them.
        </p>
      )}
    </div>
  );
}

function Toggle({ on, locked, onToggle }: { on: boolean; locked: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!on)}
      disabled={locked}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        on ? 'bg-emerald-500' : 'bg-slate-300'
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
