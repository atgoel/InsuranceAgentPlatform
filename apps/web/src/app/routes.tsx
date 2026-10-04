import { Outlet, RouteObject } from 'react-router-dom';
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
  {
    path: 'auth/callback',
    lazy: () => import('./pages/AuthCallback').then(m => ({ Component: m.AuthCallback })),
  },
  // Public routes
  {
    path: 'signup',
    lazy: () => import('../features/tenancy/screens/SoloSignupScreen').then(m => ({ Component: m.SoloSignupScreen })),
  },
  // Mobile routes
  {
    path: 'm',
    element: <Outlet />,
    children: [
      {
        path: 'today',
        lazy: () => import('../features/crm/screens/TodayScreen').then(m => ({ Component: m.TodayScreen })),
      },
      {
        path: 'leads',
        lazy: () => import('../features/crm/screens/MobileLeadsScreen').then(m => ({ Component: m.MobileLeadsScreen })),
      },
      {
        path: 'leads/:id',
        lazy: () => import('../features/crm/screens/MobileLeadScreen').then(m => ({ Component: m.MobileLeadScreen })),
      },
      {
        path: 'tasks',
        lazy: () => import('../features/crm/screens/MyTasksScreen').then(m => ({ Component: m.MyTasksScreen })),
      },
      { path: 'customers', element: <EmptyState title="Coming in a later module" /> },
      { path: 'book', lazy: () => import('../features/book/screens/DueCalendarScreen').then(m => ({ Component: m.DueCalendarScreen })) },
      { path: 'dues', lazy: () => import('../features/book/screens/DueCalendarScreen').then(m => ({ Component: m.DueCalendarScreen })) },
      { path: 'book/import', lazy: () => import('../features/book/screens/BookImportScreen').then(m => ({ Component: m.BookImportScreen })) },
      { path: 'servicing', lazy: () => import('../features/book/screens/ServicingTrackerScreen').then(m => ({ Component: m.ServicingTrackerScreen })) },
      {
        path: 'research',
        lazy: () => import('../features/catalogue/screens/ResearchLibraryScreen').then(m => ({ Component: m.ResearchLibraryScreen })),
      },
      {
        path: 'calculators',
        lazy: () => import('../features/advice/screens/CalculatorsScreen').then(m => ({ Component: m.CalculatorsScreen })),
      },
      {
        path: 'compare',
        lazy: () => import('../features/catalogue/screens/CompareScreen').then(m => ({ Component: m.CompareScreen })),
      },
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
    element: <Outlet />,
    children: [
      {
        path: 'leads',
        lazy: () => import('../features/crm/screens/LeadsWorkspaceScreen').then(m => ({ Component: m.LeadsWorkspaceScreen })),
      },
      {
        path: 'leads/:id',
        lazy: () => import('../features/crm/screens/LeadRecordScreen').then(m => ({ Component: m.LeadRecordScreen })),
      },
      {
        path: 'pipeline',
        lazy: () => import('../features/crm/screens/PipelineScreen').then(m => ({ Component: m.PipelineScreen })),
      },
      {
        path: 'tasks',
        lazy: () => import('../features/crm/screens/TasksScreen').then(m => ({ Component: m.TasksScreen })),
      },
      {
        path: 'customers',
        lazy: () => import('../features/party/screens/CustomersScreen').then(m => ({ Component: m.CustomersScreen })),
      },
      {
        path: 'customers/:id',
        lazy: () => import('../features/party/screens/CustomerRecordScreen').then(m => ({ Component: m.CustomerRecordScreen })),
      },
      {
        path: 'opportunities/:id/quote',
        lazy: () => import('../features/advice/screens/QuoteWorkspaceScreen').then(m => ({ Component: m.QuoteWorkspaceScreen })),
      },
      {
        path: 'advice/:id',
        lazy: () => import('../features/advice/screens/AdviceRecordScreen').then(m => ({ Component: m.AdviceRecordScreen })),
      },
      {
        path: 'routing',
        lazy: () => import('../features/crm/screens/RoutingRulesScreen').then(m => ({ Component: m.RoutingRulesScreen })),
      },
      {
        path: 'import',
        lazy: () => import('../features/crm/screens/LeadImportScreen').then(m => ({ Component: m.LeadImportScreen })),
      },
      {
        path: 'import/duplicates',
        lazy: () => import('../features/party/screens/DuplicateQueueScreen').then(m => ({ Component: m.DuplicateQueueScreen })),
      },
      { path: '*', element: <EmptyState title="Coming in a later module" /> },
    ],
  },
  // Console routes
  {
    path: 'console',
    element: <div>Console Shell<Outlet /></div>, // Placeholder
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
        path: 'custom-fields',
        lazy: () => import('../features/tenancy/screens/CustomFieldsScreen').then(m => ({ Component: m.CustomFieldsScreen })),
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
