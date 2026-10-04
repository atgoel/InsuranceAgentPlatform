export interface DemoPersona {
  username: string;
  name: string;
  role: string;
  roleLabel: string;
  home: string;
}

export const DEMO_PASSWORD = 'Demo@1234';

export const DEMO_PERSONAS: DemoPersona[] = [
  { username: 'priya.sales', name: 'Priya Sharma', role: 'SALESPERSON', roleLabel: 'Salesperson', home: '/m/today' },
  { username: 'rahul.manager', name: 'Rahul Verma', role: 'BRANCH_MANAGER', roleLabel: 'Branch manager', home: '/crm/leads' },
  { username: 'anita.admin', name: 'Anita Rao', role: 'TENANT_ADMIN', roleLabel: 'Tenant admin', home: '/console/tenant' },
  { username: 'vikram.po', name: 'Vikram Iyer', role: 'PRINCIPAL_OFFICER', roleLabel: 'Principal officer', home: '/console/onboarding' },
  { username: 'meera.ops', name: 'Meera Nair', role: 'OPS', roleLabel: 'Operations', home: '/console/onboarding' },
];

/** Home route of the first role that has a persona home; '/' when none does. */
export function homeForRoles(roles: string[]): string {
  for (const role of roles) {
    const persona = DEMO_PERSONAS.find((p) => p.role === role);
    if (persona) return persona.home;
  }
  return '/';
}
