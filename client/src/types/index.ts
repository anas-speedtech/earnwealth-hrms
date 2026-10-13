export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE';

export interface AuthState {
  user: { id: string; email: string; role: Role } | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (role: Role, email: string, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}
