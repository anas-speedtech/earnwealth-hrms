import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { passwordService } from '../../services/auth.service';

export default function ForgotPassword() {
  const navigate = useNavigate();
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
      // The message on screen is deliberately the same whether or not the
      // address has an account. The email is carried to the next step so the
      // user does not have to type it again.
      setSubmitted(true);
    } catch (err: unknown) {
      // Surface the real reason when the server tells us reset email is not
      // available, so the user is not told a code was sent when it was not.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 503) {
        setError(
          'Password reset by email is not available. Please contact your administrator to reset your password.',
        );
      } else {
        setError('Unable to process your request. Please try again.');
      }
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
            Enter your email and we will send you a verification code.
          </p>
        </div>

        {submitted ? (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" role="status">
            <p className="text-sm text-green-700">
              If an account exists for <strong>{email}</strong>, a verification code has been sent.
              It expires in <strong>5 minutes</strong>. Please check your inbox.
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
                Send verification code
              </Button>
            </form>
          </>
        )}

        <div className="mt-6 flex flex-col gap-3 text-center text-sm">
          <button
            type="button"
            onClick={() => navigate('/verify-otp', { state: { email } })}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            I have a code — enter it
          </button>
          <Link to="/login" className="text-slate-500 hover:text-slate-700">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
