export const routes = [
  { path: '/', element: 'redirect' },
  { path: '/super-admin/login', element: 'login', role: 'SUPER_ADMIN' },
  { path: '/admin/login', element: 'login', role: 'ADMIN' },
  { path: '/hr/login', element: 'login', role: 'HR' },
  { path: '/employee/login', element: 'login', role: 'EMPLOYEE' },
];
