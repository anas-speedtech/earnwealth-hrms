export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'HR' | 'HR_MANAGER' | 'EMPLOYEE';

export const RoleLabels: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  HR_MANAGER: 'HR',
  EMPLOYEE: 'Employee',
};

export const RoleColors: Record<Role, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-800',
  ADMIN: 'bg-blue-100 text-blue-800',
  HR: 'bg-green-100 text-green-800',
  HR_MANAGER: 'bg-green-100 text-green-800',
  EMPLOYEE: 'bg-slate-100 text-slate-800',
};
