import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LoadingSkeleton, SearchField } from '../../design-system';
import { useT } from '../../lib/i18n';
import { LangSwitch } from './LangSwitch';
import { SidebarSection } from './SidebarSection';
import { groupBySection, visibleEntries, type NavEntry } from './nav';
import { RoleName } from './RoleName';
import { SignOutButton } from './SignOutButton';
import { useShellData, type ShellData } from './useShellData';
import './chrome.css';
import './SidebarShell.css';

function SidebarHeader({ data }: { data: ShellData }) {
  const { t } = useT();
  return (
    <div className="sb-header">
      <p className="sb-tenant">{data.tenantName ?? t('app.title')}</p>
      <p className="sb-role">
        {data.userName && <span>{data.userName}</span>}
        {data.roles[0] && <RoleName role={data.roles[0]} />}
      </p>
    </div>
  );
}

function NavBody({ entries, data, query }: { entries: NavEntry[]; data: ShellData; query: string }) {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState<string[]>([]);
  if (data.permissionsStatus === 'loading') return <LoadingSkeleton lines={4} />;
  const shown = visibleEntries(entries, data.can, t, query);
  if (shown.length === 0) return <p className="sb-empty">{t('shell.noMatches')}</p>;
  const toggle = (section: string) =>
    setCollapsed((current) => (current.includes(section) ? current.filter((s) => s !== section) : [...current, section]));
  return (
    <>
      {data.permissionsStatus === 'error' && (
        <p role="alert" className="shell-error">
          {t('shell.navError')}
        </p>
      )}
      {groupBySection(shown).map((group) => (
        <SidebarSection
          key={group.section}
          section={group}
          expanded={query.trim() !== '' || !collapsed.includes(group.section)}
          onToggle={() => toggle(group.section)}
        />
      ))}
    </>
  );
}

/** Sidebar layout shared by the CRM and Console surfaces: tenant and role, search, collapsible sections, Sign out. */
export function SidebarShell({ entries }: { entries: NavEntry[] }) {
  const { t } = useT();
  const data = useShellData();
  const [query, setQuery] = useState('');
  return (
    <div className="sb-layout">
      <aside className="sb-sidebar">
        <SidebarHeader data={data} />
        <SearchField label={t('shell.search')} value={query} onChange={setQuery} />
        <nav className="sb-nav" aria-label={t('shell.sidebarNav')}>
          <NavBody entries={entries} data={data} query={query} />
        </nav>
        <div className="sb-footer">
          <LangSwitch />
          <SignOutButton />
        </div>
      </aside>
      <main className="sb-main">
        <Outlet />
      </main>
    </div>
  );
}
