import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6f8fc] px-4 py-8 before:absolute before:-left-32 before:-top-32 before:h-96 before:w-96 before:rounded-full before:bg-primary-200/40 before:blur-3xl after:absolute after:-bottom-40 after:-right-24 after:h-96 after:w-96 after:rounded-full after:bg-violet-200/40 after:blur-3xl">
      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 shadow-2xl shadow-slate-900/10 backdrop-blur lg:grid-cols-2">
        {/* Left — brand panel. Replace this block with the company logo/imagery. */}
        <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#0b182d] via-slate-900 to-primary-950 p-12 text-center lg:flex">
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full border border-white/10" />
          <div className="absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-primary-500/20 blur-3xl" />
          <img
            src="/ews-logo.png"
            alt="EarnWealth Kamate Raho"
            className="relative mb-6 h-44 w-44 rounded-3xl bg-white object-contain shadow-xl shadow-primary-950/50"
          />
          <h2 className="relative text-3xl font-bold tracking-tight text-white">EWS HRMS</h2>
          <p className="relative mt-2 max-w-xs text-sm leading-6 text-slate-300">A calm, connected workspace for your people and their best work.</p>
          <div className="relative mt-10 flex items-center gap-2 text-xs font-medium text-sky-200"><span className="h-2 w-2 rounded-full bg-emerald-400" />Secure employee workspace</div>
        </div>

        {/* Right — login form */}
        <div className="p-8 sm:p-12">
          {/* Logo (small screens) */}
          <div className="text-center mb-8 lg:hidden">
            <img
              src="/ews-logo.png"
              alt="EarnWealth Kamate Raho"
              className="mx-auto mb-4 h-24 w-24 rounded-2xl bg-white object-contain shadow-md"
            />
            <h1 className="text-3xl font-bold text-slate-900">EWS HRMS</h1>
            <p className="text-sm text-slate-500 mt-1">Human Resource Management System</p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <Input
              label="Email Address"
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
                className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
                disabled={isLoading}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l-3.293-3.293m0 0a3 3 0 104.243-4.243l3.293 3.293m-3.293-3.293l3.293 3.293M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            <Button type="submit" className="w-full py-3" isLoading={isLoading}>
              Sign In
            </Button>

            <div className="text-center">
              <Link
                to="/forgot-password"
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Forgot password?
              </Link>
            </div>
          </form>

          {/* Security note */}
          <p className="text-center text-xs text-slate-400 mt-6">
            Secured by EWS HRMS Authentication
          </p>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6 lg:hidden">
          &copy; {new Date().getFullYear()} EWS. All rights reserved.
        </p>
      </div>
    </div>
  );
}
