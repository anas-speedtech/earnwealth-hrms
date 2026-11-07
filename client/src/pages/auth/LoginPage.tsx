import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

interface LoginPageProps {
  title: string;
  subtitle: string;
  onSubmit: (email: string, password: string) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
}

export default function LoginPage({ title, subtitle, onSubmit, isLoading, error }: LoginPageProps) {
  // UAT convenience: the admin account is baked into the build via client/.env
  // (VITE_ADMIN_EMAIL / VITE_ADMIN_PASSWORD). Undefined in dev unless set.
  const [email, setEmail] = useState<string>(import.meta.env.VITE_ADMIN_EMAIL ?? '');
  const [password, setPassword] = useState<string>(import.meta.env.VITE_ADMIN_PASSWORD ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address.';
    }
    if (!password) {
      newErrors.password = 'Password is required.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(email, password);
  };

  // One neutral brand treatment for all roles — the login page is role-agnostic.
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f8fafc] px-4 py-10">
      <div className="relative z-10 grid w-full max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_4px_rgba(15,23,42,0.05),0_24px_64px_-24px_rgba(15,23,42,0.25)] lg:grid-cols-[1fr_1.1fr]">
        {/* Left — brand panel: DIP banner, fully visible (no cropping) */}
        <div className="hidden flex-col items-center justify-center overflow-hidden bg-[#4a0d0d] p-8 lg:flex">
          <img
            src="/earnwealth-logo.jpg"
            alt="Discipline · Integrity · Performance"
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl shadow-black/50 ring-1 ring-white/10"
          />
        </div>

        {/* Right — login form with the company logo at the top */}
        <div className="px-8 py-8 sm:px-10">
          <div className="mb-6 flex flex-col items-center gap-2.5">
            <img
              src="/pillars.png"
              alt="EarnWealth — Kamate Raho"
              className="h-24 rounded-xl object-contain shadow ring-1 ring-slate-200"
            />
            <p className="text-[13px] font-semibold text-slate-500">
              Discipline · Integrity · Performance
            </p>
          </div>

          <div className="mb-6">
            <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
            <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-3.5 py-2.5 ring-1 ring-inset ring-red-600/10" role="alert">
              <p className="text-[13px] text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Email address"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((prev) => ({ ...prev, email: undefined })); }}
              error={errors.email}
              required
              autoFocus
              disabled={isLoading}
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((prev) => ({ ...prev, password: undefined })); }}
                error={errors.password}
                required
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[34px] text-slate-400 transition hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 rounded"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
                disabled={isLoading}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <Button type="submit" size="lg" className="w-full" isLoading={isLoading}>
              Sign in
            </Button>

            <div className="pt-1 text-center">
              <Link
                to="/forgot-password"
                className="text-[13px] font-medium text-cyan-700 transition hover:text-cyan-800"
              >
                Forgot password?
              </Link>
            </div>
          </form>

          <p className="mt-8 text-center text-[11px] text-slate-400">
            &copy; {new Date().getFullYear()} EWS. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
