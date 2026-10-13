import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { passwordService } from '../../services/auth.service';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('This reset link is incomplete. Please use the link from your email.');
    }
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await passwordService.reset(token, password);
      navigate('/login', { replace: true });
    } catch {
      setError('This reset link is invalid or has expired. Please request a new one.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-slate-100 mb-4">
            <span className="text-2xl font-bold text-slate-700">E</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
          <p className="text-sm text-slate-500 mt-1">Enter a new password for your account.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="relative">
            <Input
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading || !token}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              disabled={isLoading}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <Input
            label="Confirm New Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isLoading || !token}
          />

          <Button type="submit" className="w-full" isLoading={isLoading} disabled={!token}>
            Update password
          </Button>
        </form>

        <p className="text-center text-sm mt-6">
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
