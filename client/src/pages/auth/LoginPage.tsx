import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

interface LoginPageProps {
  role: 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE';
  title: string;
  subtitle: string;
  roleColor: string;
  onSubmit: (email: string, password: string) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
}

export const roleConfig: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', color: 'purple' },
  ADMIN: { label: 'Admin', color: 'blue' },
  HR: { label: 'HR', color: 'green' },
  EMPLOYEE: { label: 'Employee', color: 'slate' },
};

export default function LoginPage({ role: _role, title, subtitle, roleColor, onSubmit, isLoading, error }: LoginPageProps) {
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

  const colorMap: Record<string, { bg: string; text: string; border: string; focus: string; light: string }> = {
    purple: {
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
      focus: 'focus:ring-purple-500 focus:border-purple-500',
      light: 'bg-purple-100 text-purple-700',
    },
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      focus: 'focus:ring-blue-500 focus:border-blue-500',
      light: 'bg-blue-100 text-blue-700',
    },
    green: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
      focus: 'focus:ring-green-500 focus:border-green-500',
      light: 'bg-green-100 text-green-700',
    },
    slate: {
      bg: 'bg-slate-50',
      text: 'text-slate-700',
      border: 'border-slate-200',
      focus: 'focus:ring-slate-500 focus:border-slate-500',
      light: 'bg-slate-100 text-slate-700',
    },
  };

  const colors = colorMap[roleColor] || colorMap.slate;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Left — brand panel. Replace this block with the company logo/imagery. */}
        <div className="hidden lg:flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 p-12 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 mb-6">
            <span className="text-4xl font-bold text-white">E</span>
          </div>
          <h2 className="text-3xl font-bold text-white">EWS HRMS</h2>
          <p className="text-sm text-slate-300 mt-2">Human Resource Management System</p>
          <p className="text-xs text-slate-400 mt-8">
            {/* Placeholder for company logo / brand image */}
            Brand image placeholder
          </p>
        </div>

        {/* Right — login form */}
        <div className="p-8 sm:p-10">
          {/* Logo (small screens) */}
          <div className="text-center mb-8 lg:hidden">
            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl mb-4 ${colors.light}`}>
              <span className={`text-2xl font-bold ${colors.text}`}>E</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900">EWS HRMS</h1>
            <p className="text-sm text-slate-500 mt-1">Human Resource Management System</p>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          </div>

          {/* Role badge */}
          <div className="mb-4">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${colors.light}`}>
              {roleConfig[_role]?.label || _role}
            </span>
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

            <Button type="submit" className="w-full" isLoading={isLoading}>
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
