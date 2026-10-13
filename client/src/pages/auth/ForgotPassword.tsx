import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { passwordService } from '../../services/auth.service';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await passwordService.requestReset(email.trim());
      // Deliberately the same message either way, so an unknown address does
      // not stand out to the caller.
      setSubmitted(true);
    } catch {
      setError('Unable to process your request. Please try again.');
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
          <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
          <p className="text-sm text-slate-500 mt-1">
            We will email you a link to choose a new password.
          </p>
        </div>

        {submitted ? (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" role="status">
            <p className="text-sm text-green-700">
              If an account exists for <strong>{email}</strong>, a reset link has been sent. It
              expires in 1 hour. Please check your inbox.
            </p>
          </div>
        ) : (
          <>
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
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
              <Button type="submit" className="w-full" isLoading={isLoading}>
                Send reset link
              </Button>
            </form>
          </>
        )}

        <p className="text-center text-sm mt-6">
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
