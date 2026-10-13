import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface RoleRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export default function RoleRoute({ children, allowedRoles }: RoleRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // The stored role may be the legacy HR_MANAGER value; it authorises as HR.
  const effectiveRole = user.role === 'HR_MANAGER' ? 'HR' : user.role;

  if (!allowedRoles.includes(effectiveRole)) {
    const fallback: Record<string, string> = {
      SUPER_ADMIN: '/super-admin/dashboard',
      ADMIN: '/admin/dashboard',
      HR: '/hr/dashboard',
      HR_MANAGER: '/hr/dashboard',
      EMPLOYEE: '/employee/dashboard',
    };
    return <Navigate to={fallback[user.role] || '/login'} replace />;
  }

  return <>{children}</>;
}
