import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CommonLogin from '../pages/auth/CommonLogin';

const mockLogin = vi.fn();
const mockGetProfile = vi.fn();
const mockAuthLogin = vi.fn();

vi.mock('../services/auth.service', () => ({
  authService: {
    login: (...args: unknown[]) => mockAuthLogin(...args),
  },
}));

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockAuthContext = {
  user: null,
  isAuthenticated: false,
  login: (...args: unknown[]) => mockLogin(...args),
  fetchProfile: () => mockGetProfile(),
  logout: vi.fn(),
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthContext,
  IDLE_REASON_KEY: 'ews_idle_reason',
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <CommonLogin />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('CommonLogin — single login page, role decided by the server', () => {
  it('renders one generic login form with no role selector', () => {
    renderLogin();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByLabelText(/^password$/i)).toBeDefined();

    // No role picker, and no role name advertised on the page.
    expect(screen.queryByRole('combobox')).toBeNull();
    ['Super Admin', 'Admin', 'HR', 'Employee'].forEach((label) => {
      expect(screen.queryByText(new RegExp(`^${label}$`, 'i'))).toBeNull();
    });
  });

  it('redirects each role to its own dashboard after the server reports the role', async () => {
    mockAuthLogin.mockResolvedValue({
      user: { id: '1', email: 'a@x.com', role: 'SUPER_ADMIN' },
      accessToken: 'a',
      refreshToken: 'r',
    });

    renderLogin();
    await userEvent.type(screen.getByLabelText(/email address/i), 'a@x.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pw123456');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/super-admin/dashboard', { replace: true }),
    );
    // The role passed to the auth store is the server's, not anything from the UI.
    expect(mockLogin).toHaveBeenCalledWith('SUPER_ADMIN', 'a@x.com', 'a', 'r');
  });

  it('maps the legacy HR_MANAGER role to the HR dashboard', async () => {
    mockAuthLogin.mockResolvedValue({
      user: { id: '2', email: 'hr@x.com', role: 'HR_MANAGER' },
      accessToken: 'a',
      refreshToken: 'r',
    });

    renderLogin();
    await userEvent.type(screen.getByLabelText(/email address/i), 'hr@x.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pw123456');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/hr/dashboard', { replace: true }),
    );
  });

  it('blocks an unknown role instead of granting any dashboard', async () => {
    mockAuthLogin.mockResolvedValue({
      user: { id: '3', email: 'x@x.com', role: 'MYSTERY_ROLE' },
      accessToken: 'a',
      refreshToken: 'r',
    });

    renderLogin();
    await userEvent.type(screen.getByLabelText(/email address/i), 'x@x.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pw123456');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText(/role is not supported/i)).toBeDefined(),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows invalid credentials for a wrong password without revealing which field failed', async () => {
    mockAuthLogin.mockRejectedValue({
      response: { data: { error: { code: 'INVALID_CREDENTIALS' } } },
    });

    renderLogin();
    await userEvent.type(screen.getByLabelText(/email address/i), 'a@x.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText(/invalid email or password/i)).toBeDefined(),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('refuses a second, different user while one is signed in on this browser', async () => {
    localStorage.setItem('ews_session_lock', 'someone@else.com');

    renderLogin();
    await userEvent.type(screen.getByLabelText(/email address/i), 'a@x.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'pw123456');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByText(/already signed in/i)).toBeDefined());
    // The login request must not even be sent.
    expect(mockAuthLogin).not.toHaveBeenCalled();
  });

  it('toggles password visibility', async () => {
    renderLogin();
    const field = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(field.type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(field.type).toBe('text');
  });
});
