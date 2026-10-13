import LoginPage from './LoginPage';
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/auth.service';
import { useNavigate } from 'react-router-dom';

const EXPECTED_ROLE = 'EMPLOYEE';
const EXPECTED_ROLE_LABEL = 'Employee';

export default function EmployeeLogin() {
  const { login, fetchProfile, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/employee/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authService.login({ email, password });
      if (response.user.role !== EXPECTED_ROLE) {
        const actualLabel = response.user.role.replace(/_/g, ' ').toLowerCase();
        setError(`This account is registered as ${actualLabel}, not ${EXPECTED_ROLE_LABEL}. Use the ${actualLabel} login page.`);
        return;
      }
      await login(response.user.role, response.user.email, response.accessToken, response.refreshToken);
      await fetchProfile();
      navigate('/employee/dashboard', { replace: true });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LoginPage
      role="EMPLOYEE"
      title="Employee Login"
      subtitle="Access your self-service portal"
      roleColor="slate"
      onSubmit={handleSubmit}
      isLoading={isLoading}
      error={error}
    />
  );
}

function getErrorMessage(err: unknown): string {
  const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
  if (code === 'ACCOUNT_INACTIVE') {
    return 'Your account is inactive or suspended. Contact HR.';
  }
  if (code === 'RATE_LIMIT_EXCEEDED') {
    return 'Too many login attempts. Please try again later.';
  }
  return 'Invalid email or password. Please try again.';
}
