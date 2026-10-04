export interface NavEntry {
  /** i18n key of the sidebar section heading; empty for the mobile bottom nav. */
  section: string;
  labelKey: string;
  to: string;
  /** Permission the caller needs; an entry without one is shown to everybody. */
  permission?: string;
  /** False while the module that owns the screen is not built: the entry stays visible with a "Coming soon" badge. */
  built: boolean;
}

export const MOBILE_NAV: NavEntry[] = [
  { section: '', labelKey: 'shell.today', to: '/m/today', built: true },
  { section: '', labelKey: 'shell.leads', to: '/m/leads', permission: 'crm.lead.read', built: true },
  { section: '', labelKey: 'shell.customers', to: '/m/customers', permission: 'party.read', built: true },
  { section: '', labelKey: 'shell.book', to: '/m/book', permission: 'book.read', built: true },
  { section: '', labelKey: 'shell.me', to: '/m/me', built: true },
];

export const CRM_NAV: NavEntry[] = [
  { section: 'nav.section.sales', labelKey: 'shell.leads', to: '/crm/leads', permission: 'crm.lead.read', built: true },
  { section: 'nav.section.sales', labelKey: 'nav.pipeline', to: '/crm/pipeline', permission: 'crm.opportunity.read', built: true },
  { section: 'nav.section.sales', labelKey: 'shell.customers', to: '/crm/customers', permission: 'party.read', built: true },
  { section: 'nav.section.sales', labelKey: 'nav.tasks', to: '/crm/tasks', permission: 'crm.task.read', built: true },
  { section: 'nav.section.growth', labelKey: 'nav.campaigns', to: '/crm/campaigns', built: false },
  { section: 'nav.section.admin', labelKey: 'nav.routing', to: '/crm/routing', permission: 'crm.routing.read', built: true },
  { section: 'nav.section.admin', labelKey: 'nav.import', to: '/crm/import', permission: 'crm.import', built: true },
];

export const CONSOLE_NAV: NavEntry[] = [
  { section: 'nav.section.overview', labelKey: 'nav.dashboard', to: '/console/dashboard', built: false },
  { section: 'nav.section.people', labelKey: 'nav.onboarding', to: '/console/onboarding', permission: 'distribution.member.read', built: true },
  { section: 'nav.section.people', labelKey: 'nav.usersRoles', to: '/console/users-roles', permission: 'distribution.role.read', built: true },
  { section: 'nav.section.setup', labelKey: 'nav.tenant', to: '/console/tenant', permission: 'tenant.read', built: true },
  { section: 'nav.section.setup', labelKey: 'nav.brand', to: '/console/brand', permission: 'tenant.brand.write', built: true },
  { section: 'nav.section.setup', labelKey: 'nav.configuration', to: '/console/custom-fields', permission: 'tenant.custom_field.write', built: true },
  { section: 'nav.section.setup', labelKey: 'nav.integrations', to: '/console/integrations', permission: 'integration.read', built: true },
  { section: 'nav.section.governance', labelKey: 'nav.content', to: '/console/content', built: false },
  { section: 'nav.section.governance', labelKey: 'nav.reports', to: '/console/reports', built: false },
  { section: 'nav.section.governance', labelKey: 'nav.compliance', to: '/console/compliance', built: false },
  { section: 'nav.section.governance', labelKey: 'nav.commission', to: '/console/commission', built: false },
  { section: 'nav.section.governance', labelKey: 'nav.aiControls', to: '/console/ai-controls', built: false },
  { section: 'nav.section.platform', labelKey: 'nav.operatorTenants', to: '/console/ops/tenants', permission: 'ops.tenants', built: true },
];

export interface NavSection {
  section: string;
  entries: NavEntry[];
}

/** Entries the caller may see (no permission required, or granted), filtered by the search text on the translated label. */
export function visibleEntries(
  entries: readonly NavEntry[],
  can: (permission: string) => boolean,
  t: (key: string) => string,
  query = '',
): NavEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (entry.permission && !can(entry.permission)) return false;
    return needle === '' || t(entry.labelKey).toLowerCase().includes(needle);
  });
}

/** Groups entries by section, keeping the order of first appearance. */
export function groupBySection(entries: readonly NavEntry[]): NavSection[] {
  const sections: NavSection[] = [];
  for (const entry of entries) {
    const existing = sections.find((s) => s.section === entry.section);
    if (existing) existing.entries.push(entry);
    else sections.push({ section: entry.section, entries: [entry] });
  }
  return sections;
}
