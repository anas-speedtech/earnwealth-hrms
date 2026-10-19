import { useState, FormEvent, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { passwordService } from '../../services/auth.service';

const OTP_LENGTH = 6;
const EMPTY_OTP = Array(OTP_LENGTH).fill('');

export default function VerifyOtp() {
  const location = useLocation();
  const navigate = useNavigate();
  const emailFromState = (location.state as { email?: string } | null)?.email || '';

  const [email, setEmail] = useState(emailFromState);
  const [digits, setDigits] = useState<string[]>(EMPTY_OTP);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const otp = digits.join('');

  const setDigit = (index: number, value: string) => {
    // Accept only the last character typed, so pasting over a filled box works
    // and typing into a filled box replaces rather than appends.
    const char = value.replace(/\D/g, '').slice(-1);
    if (!char && value) return;

    setDigits((prev) => {
      const next = [...prev];
      next[index] = char;
      return next;
    });

    if (char) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;

    const next = Array(OTP_LENGTH).fill('');
    pasted.split('').forEach((c, i) => {
      next[i] = c;
    });
    setDigits(next);
    inputs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError('Enter the email address the code was sent to.');
      return;
    }
    if (otp.length !== OTP_LENGTH) {
      setError(`Enter all ${OTP_LENGTH} digits of the code.`);
      return;
    }

    setIsLoading(true);
    try {
      const { verifyToken } = await passwordService.verifyOtp(email.trim(), otp);
      navigate('/reset-password', { state: { verifyToken, email }, replace: true });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setError('Too many code attempts. Please request a new code.');
      } else {
        setError('That code is not valid or has expired. Please try again.');
      }
      setDigits(EMPTY_OTP);
      inputs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) {
      setError('Enter the email address the code was sent to.');
      return;
    }
    setIsResending(true);
    setError(null);
    setNotice(null);
    try {
      await passwordService.requestReset(email.trim());
      setNotice('A new code has been sent. The previous code no longer works.');
      setDigits(EMPTY_OTP);
      inputs.current[0]?.focus();
    } catch {
      setError('Unable to send a new code. Please try again shortly.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-slate-100 mb-4">
            <span className="text-2xl font-bold text-slate-700">E</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Enter verification code</h1>
          <p className="text-sm text-slate-500 mt-1">
            We sent a 6-digit code to your email. It expires in 5 minutes.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg" role="alert">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {notice && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg" role="status">
            <p className="text-sm text-green-700">{notice}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="otp-email" className="block text-sm font-medium text-slate-700 mb-1">
              Email Address
            </label>
            <input
              id="otp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              disabled={isLoading}
              autoComplete="email"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
            />
          </div>

          <fieldset disabled={isLoading}>
            <legend className="block text-sm font-medium text-slate-700 mb-2">Verification code</legend>
            <div className="flex justify-between gap-2">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => setDigit(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                  className="w-12 h-14 text-center text-xl font-semibold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
                />
              ))}
            </div>
          </fieldset>

          <Button type="submit" className="w-full" isLoading={isLoading} disabled={otp.length !== OTP_LENGTH}>
            Verify code
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-3 text-center text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || isLoading}
            className="text-primary-600 hover:text-primary-700 font-medium disabled:text-slate-400"
          >
            {isResending ? 'Sending...' : 'Send a new code'}
          </button>
          <Link to="/login" className="text-slate-500 hover:text-slate-700">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
