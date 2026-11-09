import { useEffect, useState } from 'react';
import { User, Mail, ShieldCheck, KeyRound, CalendarDays, Save, Camera, Trash2, Loader2 } from 'lucide-react';
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
  const { user, logout, avatarUrl, avatarLoading, setAvatar, removeAvatar } = useAuth();
  const [personal, setPersonal] = useState<PersonalProfile>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [photoInput, setPhotoInput] = useState<HTMLInputElement | null>(null);

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

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      toast.error('Please choose an image file (JPG, PNG or WebP).');
      return;
    }
    void setAvatar(file).then(
      () => toast.success('Profile photo updated.'),
      () => toast.error('Could not upload the photo. Try a smaller image.'),
    );
  };

  const handlePhotoRemove = () => {
    void removeAvatar().then(
      () => toast.success('Profile photo removed.'),
      () => toast.error('Could not remove the photo.'),
    );
  };

  const initials = fullName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <DashboardShell role="EMPLOYEE" userName={fullName} userEmail={user?.email || ''} onLogout={logout}>
      <Header title="Profile" subtitle="Your account and personal details" />
      <div className="p-6 max-w-3xl space-y-4">
        {/* Profile photo — stored in the database and served via the API, so
            display never depends on a server directory or nginx permission. */}
        <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)]">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${fullName} profile`}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-slate-200"
            />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-full bg-slate-900 text-lg font-bold text-white">
              {initials || 'U'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold tracking-tight text-slate-900">Profile Photo</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Shown next to your name on the dashboard. Photos are stored with your account.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <input
                ref={(el) => setPhotoInput(el)}
                type="file"
                accept="image/*"
                onChange={handlePhotoPick}
                className="hidden"
              />
              <Button size="sm" variant={avatarUrl ? 'secondary' : 'primary'} disabled={avatarLoading} onClick={() => photoInput?.click()}>
                {avatarLoading ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Camera size={14} className="mr-1.5" />
                )}
                {avatarUrl ? 'Change Photo' : 'Add Photo'}
              </Button>
              {avatarUrl && (
                <Button size="sm" variant="ghost" disabled={avatarLoading} onClick={handlePhotoRemove}>
                  <Trash2 size={14} className="mr-1.5" /> Remove
                </Button>
              )}
            </div>
          </div>
        </div>

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
