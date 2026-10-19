export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export type Role = 'SUPER_ADMIN' | 'HR_ADMIN' | 'EMPLOYEE';

export const RoleLabels: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  HR_ADMIN: 'HR Admin',
  EMPLOYEE: 'Employee',
};

export const RoleColors: Record<Role, string> = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-800',
  HR_ADMIN: 'bg-green-100 text-green-800',
  EMPLOYEE: 'bg-slate-100 text-slate-800',
};
