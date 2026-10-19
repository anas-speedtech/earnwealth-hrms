export const routes = [
  { path: '/', element: 'redirect' },
  { path: '/super-admin/login', element: 'login', role: 'SUPER_ADMIN' },
  { path: '/admin/login', element: 'login', role: 'HR_ADMIN' },
  { path: '/hr/login', element: 'login', role: 'HR_ADMIN' },
  { path: '/employee/login', element: 'login', role: 'EMPLOYEE' },
];
