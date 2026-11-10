import { useState, FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { passwordService } from '../../services/auth.service';

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Two ways in:
  //  * emailed link — `/reset-password?token=…` (30-minute signed token)
  //  * OTP flow — the verify-otp step hands over a 10-minute verifyToken via
  //    navigation state, kept out of the URL so it stays out of history.
  const linkToken = searchParams.get('token') || '';
  const verifyToken = (location.state as { verifyToken?: string } | null)?.verifyToken || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hasCredential = Boolean(linkToken || verifyToken);

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
      if (linkToken) {
        await passwordService.resetWithLink(linkToken, password);
      } else {
        await passwordService.reset(verifyToken, password);
      }
      setDone(true);
    } catch {
      setError('Your verification has expired. Please start the reset again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-slate-100 mb-4">
            <span className="text-xl font-bold text-slate-700">E</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Choose a new password</h1>
          <p className="text-[13px] text-slate-500 mt-1">Enter a new password for your account.</p>
        </div>

        {done ? (
          <div className="space-y-4" role="status">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-[13px] text-green-700">
                Your password has been updated. You are signed out of all other devices and can
                now sign in with your new password.
              </p>
            </div>
            <Button className="w-full" onClick={() => navigate('/login', { replace: true })}>
              Go to sign in
            </Button>
          </div>
        ) : !hasCredential ? (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
              <p className="text-[13px] text-red-700">
                Your reset link or verification has expired. Please start the password reset again.
              </p>
            </div>
            <Button className="w-full" onClick={() => navigate('/forgot-password', { replace: true })}>
              Start again
            </Button>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
                <p className="text-[13px] text-red-700">{error}</p>
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
                  disabled={isLoading}
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
                disabled={isLoading}
              />

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Update password
              </Button>
            </form>
          </>
        )}

        {!done && (
          <p className="text-center text-[13px] mt-6">
            <Link to="/login" className="text-cyan-600 hover:text-cyan-700 font-medium">
              Back to sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
