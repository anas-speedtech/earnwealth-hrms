import { useEffect, useState } from 'react';
import { User, Mail, ShieldCheck, KeyRound, CalendarDays, Save } from 'lucide-react';
import DashboardShell from '../../components/layout/DashboardShell';
import Header from '../../components/layout/Header';
import { useAuth } from '../../contexts/AuthContext';
import { personalProfileService, PersonalProfile } from '../../services/personal-profile.service';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import toast from 'react-hot-toast';

const EMPTY: PersonalProfile = {
  address: '',
  dateOfBirth: '',
  emergencyContact: '',
  personalEmail: '',
  anniversaryDate: '',
};

export default function EmployeeProfilePage() {
  const { user, logout } = useAuth();
  const [personal, setPersonal] = useState<PersonalProfile>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    personalProfileService
      .getMine()
      .then((p) => { if (mounted) setPersonal(p || EMPTY); })
      .catch(() => { /* no record yet */ });
    return () => { mounted = false; };
  }, []);

  const fullName =
    user?.profile?.firstName && user?.profile?.lastName
      ? `${user.profile.firstName} ${user.profile.lastName}`
      : (user?.email || 'Employee');

  const rows = [
    { icon: User, label: 'Full name', value: fullName },
    { icon: Mail, label: 'Email', value: user?.email },
    { icon: ShieldCheck, label: 'Role', value: user?.role?.replace('_', ' ') },
    { icon: KeyRound, label: 'Account ID', value: user?.id },
    { icon: CalendarDays, label: 'Member since', value: String(user?.profile?.memberSince ?? '—') },
  ];

  const update = (field: keyof PersonalProfile, value: string) =>
    setPersonal((prev) => ({ ...prev, [field]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await personalProfileService.updateMine(personal);
      toast.success('Personal information saved.');
    } catch {
      toast.error('Could not save personal information.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell role="EMPLOYEE" userName={fullName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Profile" subtitle="Your account and personal details" />
      <div className="p-6 max-w-3xl space-y-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
          <dl className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-3">
                <dt className="flex items-center gap-2.5 text-[13px] font-medium text-slate-500">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-400">
                    <row.icon size={13} />
                  </span>
                  {row.label}
                </dt>
                <dd className="text-[13px] font-medium text-slate-900">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Personal information — employee-maintained */}
        <form
          onSubmit={handleSave}
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]"
        >
          <h2 className="text-[15px] font-bold tracking-tight text-slate-900">Personal Information</h2>
          <p className="mt-0.5 mb-4 text-[13px] text-slate-500">
            Keep these details up to date. HR keeps your official records; you maintain these here.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="Address"
                value={personal.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="Residential address"
              />
            </div>
            <Input
              label="Date of Birth"
              type="date"
              value={personal.dateOfBirth}
              onChange={(e) => update('dateOfBirth', e.target.value)}
            />
            <Input
              label="Anniversary Date"
              type="date"
              value={personal.anniversaryDate}
              onChange={(e) => update('anniversaryDate', e.target.value)}
            />
            <Input
              label="Emergency Contact Number"
              value={personal.emergencyContact}
              onChange={(e) => update('emergencyContact', e.target.value)}
              placeholder="e.g. +91 98000 00000"
            />
            <Input
              label="Personal Email"
              type="email"
              value={personal.personalEmail}
              onChange={(e) => update('personalEmail', e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
            <Button type="submit" variant="primary" isLoading={saving}>
              <Save size={14} className="mr-1.5" /> Save Personal Information
            </Button>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}
