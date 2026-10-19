import LoginPage from './LoginPage';
import { useState, useEffect } from 'react';
import { useAuth, IDLE_REASON_KEY } from '../../contexts/AuthContext';
import { authService } from '../../services/auth.service';
import { useNavigate } from 'react-router-dom';

const SESSION_ENDED_KEY = 'ews_session_ended';

const ROLE_PATHS: Record<string, string> = {
  SUPER_ADMIN: '/super-admin/dashboard',
  HR_ADMIN: '/hr/dashboard',
  // Legacy value stored by older sessions — still maps to the HR Admin
  // dashboard so existing sessions keep working.
  HR_MANAGER: '/hr/dashboard',
  EMPLOYEE: '/employee/dashboard',
};

export default function CommonLogin() {
  const { login, fetchProfile, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show why the session was ended, then clear the flag. Covers both the
  // 30-minute idle timeout and a session revoked by a newer login elsewhere.
  useEffect(() => {
    const idleReason = sessionStorage.getItem(IDLE_REASON_KEY);
    const endedReason = sessionStorage.getItem(SESSION_ENDED_KEY);
    const reason = endedReason || idleReason;
    if (reason) {
      setError(reason);
      sessionStorage.removeItem(IDLE_REASON_KEY);
      sessionStorage.removeItem(SESSION_ENDED_KEY);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      const path = ROLE_PATHS[user.role] || ROLE_PATHS[user.role.replace('_', '')];
      if (path) {
        navigate(path, { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate]);

  const handleSubmit = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // Only one active session per browser. A different user must sign out first.
      const lock = localStorage.getItem('ews_session_lock');
      if (lock && lock.toLowerCase() !== email.trim().toLowerCase()) {
        setError('Another user is already signed in on this browser. Please sign out first.');
        return;
      }

      const response = await authService.login({ email, password });

      const backendRole = response.user.role;
      const rolePath = ROLE_PATHS[backendRole];

      if (!rolePath) {
        setError('Your account role is not supported for dashboard access. Contact support.');
        return;
      }

      await login(backendRole, response.user.email, response.accessToken, response.refreshToken);
      await fetchProfile();
      navigate(rolePath, { replace: true });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LoginPage
      title="HRMS Login"
      subtitle="Sign in using your company email and password"
      onSubmit={handleSubmit}
      isLoading={isLoading}
      error={error}
    />
  );
}

function getErrorMessage(err: unknown): string {
  const axiosError = err as {
    message?: string;
    response?: { data?: { error?: { code?: string; message?: string } } };
    code?: string;
  };

  const apiCode = axiosError?.response?.data?.error?.code;
  const apiMessage = axiosError?.response?.data?.error?.message;

  if (apiCode === 'ACCOUNT_INACTIVE') {
    return 'Your account is inactive or suspended. Contact support.';
  }
  if (apiCode === 'INVALID_CREDENTIALS') {
    return 'Invalid email or password. Please try again.';
  }
  if (apiCode === 'RATE_LIMIT_EXCEEDED') {
    return 'Too many login attempts. Please try again later.';
  }
  if (apiMessage) {
    return apiMessage;
  }
  if (axiosError?.code === 'ERR_NETWORK') {
    return 'Unable to reach the server. Check your connection and try again.';
  }
  return 'Login failed. Please try again.';
}
