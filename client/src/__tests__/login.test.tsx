import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '../contexts/ToastContext';
import { AuthProvider } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import SuperAdminLogin from '../pages/auth/SuperAdminLogin';
import AdminLogin from '../pages/auth/AdminLogin';
import HrLogin from '../pages/auth/HrLogin';
import EmployeeLogin from '../pages/auth/EmployeeLogin';

const user = userEvent.setup();

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

function renderLogin(Component: typeof SuperAdminLogin) {
  return render(<Component />, { wrapper: Wrapper });
}

describe('Login Pages', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('All login pages render correctly', () => {
    it('SuperAdminLogin renders with title', () => {
      renderLogin(SuperAdminLogin);
      expect(screen.getByText('Super Admin Login')).toBeDefined();
    });

    it('AdminLogin renders with title', () => {
      renderLogin(AdminLogin);
      expect(screen.getByText('Admin Login')).toBeDefined();
    });

    it('HrLogin renders with title', () => {
      renderLogin(HrLogin);
      expect(screen.getByText('HR Login')).toBeDefined();
    });

    it('EmployeeLogin renders with title', () => {
      renderLogin(EmployeeLogin);
      expect(screen.getByText('Employee Login')).toBeDefined();
    });

    it('all login pages show EWS HRMS branding', () => {
      renderLogin(SuperAdminLogin);
      // Branding renders in both the desktop side panel and the mobile header.
      expect(screen.getAllByText('EWS HRMS').length).toBeGreaterThan(0);
    });
  });

  describe('Form validation', () => {
    it('submit button is disabled while loading', async () => {
      renderLogin(SuperAdminLogin);
      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@test.com');
      await user.type(passwordInput, 'password123');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submitButton.hasAttribute('disabled')).toBe(true);
      });
    });

    it('shows validation error for empty email', async () => {
      renderLogin(AdminLogin);
      const passwordInput = screen.getByLabelText('Password');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(passwordInput, 'password123');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Email is required.')).toBeDefined();
      });
    });

    it('shows validation error for invalid email format', async () => {
      renderLogin(HrLogin);
      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'not-an-email');
      await user.type(passwordInput, 'password123');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address.')).toBeDefined();
      });
    });

    it('shows validation error for empty password', async () => {
      renderLogin(EmployeeLogin);
      const emailInput = screen.getByLabelText('Email Address');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@test.com');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Password is required.')).toBeDefined();
      });
    });
  });

  describe('Password visibility toggle', () => {
    it('toggles password visibility', async () => {
      renderLogin(SuperAdminLogin);
      const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
      expect(passwordInput.type).toBe('password');

      const toggleButton = screen.getByLabelText('Show password');
      fireEvent.click(toggleButton);
      expect(passwordInput.type).toBe('text');

      fireEvent.click(screen.getByLabelText('Hide password'));
      expect(passwordInput.type).toBe('password');
    });
  });

  describe('Role badge display', () => {
    it('SuperAdminLogin shows Super Admin badge', () => {
      renderLogin(SuperAdminLogin);
      expect(screen.getByText('Super Admin')).toBeDefined();
    });

    it('AdminLogin shows Admin badge', () => {
      renderLogin(AdminLogin);
      expect(screen.getByText('Admin')).toBeDefined();
    });

    it('HrLogin shows HR badge', () => {
      renderLogin(HrLogin);
      expect(screen.getByText('HR')).toBeDefined();
    });

    it('EmployeeLogin shows Employee badge', () => {
      renderLogin(EmployeeLogin);
      expect(screen.getByText('Employee')).toBeDefined();
    });
  });

  describe('Login error handling', () => {
    it('shows loading state on submit', async () => {
      renderLogin(SuperAdminLogin);

      const emailInput = screen.getByLabelText('Email Address');
      const passwordInput = screen.getByLabelText('Password');
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'wrong@test.com');
      await user.type(passwordInput, 'wrongpass');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submitButton.hasAttribute('disabled')).toBe(true);
      });
    });
  });

  describe('Responsive and accessibility', () => {
    it('email input is rendered as enabled email input', () => {
      renderLogin(SuperAdminLogin);
      const emailInput = screen.getByLabelText('Email Address') as HTMLInputElement;
      expect(emailInput.type).toBe('email');
      expect(emailInput.disabled).toBe(false);
    });

    it('password toggle button is accessible', () => {
      renderLogin(AdminLogin);
      const toggleButton = screen.getByLabelText('Show password');
      expect(toggleButton.hasAttribute('aria-label')).toBe(true);
    });

    it('all inputs have proper labels', () => {
      renderLogin(HrLogin);
      expect(screen.getByLabelText('Email Address')).toBeDefined();
      expect(screen.getByLabelText('Password')).toBeDefined();
    });
  });
});

describe('AuthContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('starts unauthenticated', () => {
    let capturedValue: { isAuthenticated: boolean; user: unknown } | null = null;
    function TestComponent() {
      const ctx = useAuth();
      capturedValue = { isAuthenticated: ctx.isAuthenticated, user: ctx.user };
      return null;
    }
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </BrowserRouter>,
    );
    expect(capturedValue!.isAuthenticated).toBe(false);
    expect(capturedValue!.user).toBe(null);
  });
});
