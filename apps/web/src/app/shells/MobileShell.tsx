import { NavLink, Outlet } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { LangSwitch } from './LangSwitch';
import { MOBILE_NAV, visibleEntries } from './nav';
import { UserMenu } from './UserMenu';
import { useShellData } from './useShellData';
import './chrome.css';
import './MobileShell.css';

/** Mobile surface: phone frame (390 x 844) on wide screens, full screen on narrow; app bar and bottom nav (M00 13.7). */
export function MobileShell() {
  const { t } = useT();
  const data = useShellData();
  const entries = visibleEntries(MOBILE_NAV, data.can, t);
  return (
    <div className="m-stage">
      <div className="m-frame">
        <header className="m-appbar">
          <span className="m-brand">{data.tenantName ?? t('app.title')}</span>
          <LangSwitch />
          <UserMenu userName={data.userName} roles={data.roles} />
        </header>
        <main className="m-content">
          <Outlet />
        </main>
        <nav className="m-bottomnav" aria-label={t('shell.mainNav')}>
          {entries.map((entry) => (
            <NavLink key={entry.to} to={entry.to} className="m-navitem">
              {t(entry.labelKey)}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
