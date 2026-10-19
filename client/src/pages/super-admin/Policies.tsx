import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { compoffService, type CompOffPolicy } from '../../services/compoff.service';
import toast from 'react-hot-toast';

export default function SuperAdminPoliciesPage() {
  const { user, logout } = useAuth();
  const [policy, setPolicy] = useState<CompOffPolicy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creditExpiryMonths, setCreditExpiryMonths] = useState('3');
  const [minWorkingMinutes, setMinWorkingMinutes] = useState('4');
  const [maxDaysPerMonth, setMaxDaysPerMonth] = useState('2');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_ADMIN';

  useEffect(() => {
    let mounted = true;
    compoffService
      .getPolicy()
      .then((current) => {
        if (!mounted) return;
        setPolicy(current);
        setCreditExpiryMonths(String(current.expiryMonths ?? 3));
        setMinWorkingMinutes(String(current.minWorkingMinutes ?? 4));
        setMaxDaysPerMonth(String(current.maxDaysPerMonth ?? 2));
      })
      .catch(() => {
        if (mounted) setError('Could not load the comp-off policy.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await compoffService.updatePolicy({
        creditExpiryMonths: Number(creditExpiryMonths),
        minWorkingMinutes: Number(minWorkingMinutes),
        maxDaysPerMonth: Number(maxDaysPerMonth),
      });
      toast.success('Comp-off policy updated.');
      const refreshed = await compoffService.getPolicy();
      setPolicy(refreshed);
    } catch {
      setError('Could not update the policy.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayName = user?.profile?.firstName && user?.profile?.lastName
    ? `${user.profile.firstName} ${user.profile.lastName}`
    : user?.email || 'Super Admin';

  return (
    <DashboardShell role="SUPER_ADMIN" userName={displayName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Policies" subtitle="Comp-off credit policy" />
      <div className="p-8 max-w-3xl">
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {isLoading || !policy ? (
          <p className="text-slate-500">Loading policy…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Credit expiry</h3>
              <p className="mt-1 text-sm text-slate-500">
                Comp-off days expire this many months after they are earned.
              </p>
              <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="expiry">
                Expiry months
              </label>
              <input
                id="expiry"
                className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                type="number"
                min={1}
                value={creditExpiryMonths}
                onChange={(e) => setCreditExpiryMonths(e.target.value)}
              />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-900">Working hours rule</h3>
              <p className="mt-1 text-sm text-slate-500">
                Only days with sufficient office hours count towards earned comp-off.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="minHours">
                    Minimum worked hours
                  </label>
                  <input
                    id="minHours"
                    className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    type="number"
                    min={0}
                    value={minWorkingMinutes}
                    onChange={(e) => setMinWorkingMinutes(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700" htmlFor="maxDays">
                    Maximum days per month
                  </label>
                  <input
                    id="maxDays"
                    className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    type="number"
                    min={1}
                    value={maxDaysPerMonth}
                    onChange={(e) => setMaxDaysPerMonth(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {canManage ? (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Save Policy'}
              </button>
            ) : (
              <p className="text-sm text-slate-400">Only Super Admins and Admins can change this policy.</p>
            )}
          </form>
        )}
      </div>
    </DashboardShell>
  );
}
