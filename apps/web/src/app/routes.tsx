import { RouteObject } from 'react-router-dom';
import { Home } from './Home';
import { EmptyState } from '../design-system';

export const routes: RouteObject[] = [
  {
    index: true,
    element: <Home />,
  },
  {
    path: 'login',
    lazy: () => import('./pages/LoginPage').then(m => ({ Component: m.LoginPage })),
  },
  // Public routes
  {
    path: 'signup',
    lazy: () => import('../features/tenancy/screens/SoloSignupScreen').then(m => ({ Component: m.SoloSignupScreen })),
  },
  // Mobile routes
  {
    path: 'm',
    element: <div>Mobile Shell</div>, // Placeholder
    children: [
      { path: 'today', element: <EmptyState title="Coming in a later module" /> },
      { path: 'leads', element: <EmptyState title="Coming in a later module" /> },
      { path: 'customers', element: <EmptyState title="Coming in a later module" /> },
      { path: 'book', element: <EmptyState title="Coming in a later module" /> },
      {
        path: 'me',
        element: <div>Me Shell</div>,
        children: [
          {
            path: 'plan',
            lazy: () => import('../features/tenancy/screens/SoloPlanScreen').then(m => ({ Component: m.SoloPlanScreen })),
          },
          { path: '*', element: <EmptyState title="Coming in a later module" /> },
        ],
      },
    ],
  },
  // CRM routes
  {
    path: 'crm',
    element: <div>CRM Shell</div>, // Placeholder
    children: [{ path: '*', element: <EmptyState title="Coming in a later module" /> }],
  },
  // Console routes
  {
    path: 'console',
    element: <div>Console Shell</div>, // Placeholder
    children: [
      {
        path: 'tenant',
        lazy: () => import('../features/tenancy/screens/TenantSetupScreen').then(m => ({ Component: m.TenantSetupScreen })),
      },
      {
        path: 'brand',
        lazy: () => import('../features/tenancy/screens/BrandKitScreen').then(m => ({ Component: m.BrandKitScreen })),
      },
      {
        path: 'onboarding',
        lazy: () => import('../features/distribution/screens/OnboardingHierarchyScreen').then(m => ({ Component: m.OnboardingHierarchyScreen })),
      },
      {
        path: 'users-roles',
        lazy: () => import('../features/distribution/screens/UsersRolesScreen').then(m => ({ Component: m.UsersRolesScreen })),
      },
      {
        path: 'ops',
        children: [
          {
            path: 'tenants',
            lazy: () => import('../features/tenancy/screens/OperatorTenantsScreen').then(m => ({ Component: m.OperatorTenantsScreen })),
          },
        ],
      },
      { path: '*', element: <EmptyState title="Coming in a later module" /> },
    ],
  },
  // Catch-all for unknown routes
  {
    path: '*',
    element: <EmptyState title="Coming in a later module" />,
  },
];
