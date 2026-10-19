import { useEffect, useState, useCallback } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

interface AuditResponse {
  logs: AuditLog[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface FilterOptions {
  actions: string[];
  entityTypes: string[];
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  PASSWORD_RESET: 'Reset password',
  CREATE_INVITATION: 'Sent invitation',
  INVITATION_ACCEPTED: 'Accepted invitation',
  MIGRATION_SELFTEST: 'System check',
};

function describeAction(log: AuditLog): string {
  if (ACTION_LABELS[log.action]) return ACTION_LABELS[log.action];
  return `${log.action.replace(/_/g, ' ').toLowerCase()} on ${log.entityType.toLowerCase()}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export default function AuditLogs() {
  const { user, logout } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [filters, setFilters] = useState<FilterOptions>({ actions: [], entityTypes: [] });
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedEntity, setSelectedEntity] = useState('');
  const [search, setSearch] = useState('');

  // Fetch filter options once on mount.
  useEffect(() => {
    api.get<{ data: FilterOptions }>('/audit-logs/filters')
      .then((r) => setFilters(r.data.data))
      .catch(() => { /* non-fatal */ });
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page };
      if (selectedAction) params.action = selectedAction;
      if (selectedEntity) params.entityType = selectedEntity;
      if (search.trim()) params.search = search.trim();
      const res = await api.get<{ data: AuditResponse }>('/audit-logs', { params });
      const d = res.data.data;
      setLogs(d.logs);
      setPage(d.pagination.page);
      setTotalPages(d.pagination.totalPages);
      setTotal(d.pagination.total);
    } catch {
      setError('Could not load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [page, selectedAction, selectedEntity, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilter = () => {
    setPage(1);
    fetchLogs();
  };

  const clearFilters = () => {
    setSelectedAction('');
    setSelectedEntity('');
    setSearch('');
    setPage(1);
  };

  const hasFilters = selectedAction || selectedEntity || search.trim();

  return (
    <DashboardShell
      role="SUPER_ADMIN"
      userName={(user?.profile?.fullName as string) || user?.email || 'Super Admin'}
      userEmail={user?.email || ''}
      onLogout={logout}
    >
      <Header title="Audit Logs" subtitle="A record of sensitive actions across the system" />

      <div className="p-8 space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
            <select
              value={selectedAction}
              onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="">All actions</option>
              {filters.actions.map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Entity type</label>
            <select
              value={selectedEntity}
              onChange={(e) => { setSelectedEntity(e.target.value); setPage(1); }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value="">All types</option>
              {filters.entityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Search</label>
            <input
              type="text"
              placeholder="Actor, action, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 w-48"
            />
          </div>

          <button
            onClick={handleFilter}
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded-lg hover:bg-slate-700"
          >
            Filter
          </button>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-slate-500 text-sm hover:text-slate-700"
            >
              Clear
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Date &amp; Time</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Actor</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Entity</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 whitespace-nowrap">Record ID</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                      No audit logs match your filters.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatTime(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="text-slate-800">{log.actorName || '—'}</span>
                        <br />
                        <span className="text-slate-400 text-xs">{log.actorEmail || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                          {log.actorRole}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{describeAction(log)}</td>
                      <td className="px-4 py-3 text-slate-600">{log.entityType}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{log.entityId}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && total > 0 && (
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
              <span>
                Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total} entries
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
