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
  // Mobile routes
  {
    path: 'm',
    element: <div>Mobile Shell</div>, // Placeholder
    children: [
      { path: 'today', element: <EmptyState title="Coming in a later module" /> },
      { path: 'leads', element: <EmptyState title="Coming in a later module" /> },
      { path: 'customers', element: <EmptyState title="Coming in a later module" /> },
      { path: 'book', element: <EmptyState title="Coming in a later module" /> },
      { path: 'me', element: <EmptyState title="Coming in a later module" /> },
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
    children: [{ path: '*', element: <EmptyState title="Coming in a later module" /> }],
  },
  // Catch-all for unknown routes
  {
    path: '*',
    element: <EmptyState title="Coming in a later module" />,
  },
];
