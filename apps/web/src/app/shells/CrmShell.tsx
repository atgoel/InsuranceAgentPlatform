import { CRM_NAV } from './nav';
import { SidebarShell } from './SidebarShell';

export function CrmShell() {
  return <SidebarShell entries={CRM_NAV} />;
}
