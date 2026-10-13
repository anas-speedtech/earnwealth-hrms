import { useAuth } from '../contexts/AuthContext';

export function useAuthState() {
  return useAuth();
}

export function useAuthGuard(requiredRole?: string) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const hasAccess = requiredRole ? user?.role === requiredRole : isAuthenticated;
  return { isAuthenticated, isLoading, hasAccess, user };
}
