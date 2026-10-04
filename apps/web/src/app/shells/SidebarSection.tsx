import { NavLink } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import type { NavSection } from './nav';

export interface SidebarSectionProps {
  section: NavSection;
  expanded: boolean;
  onToggle(): void;
}

export function SidebarSection({ section, expanded, onToggle }: SidebarSectionProps) {
  const { t } = useT();
  return (
    <div className="sb-section">
      <button type="button" className="sb-section-toggle" aria-expanded={expanded} onClick={onToggle}>
        {t(section.section)}
      </button>
      {expanded && (
        <ul className="sb-list">
          {section.entries.map((entry) => (
            <li key={entry.to}>
              <NavLink to={entry.to} className="sb-link">
                <span>{t(entry.labelKey)}</span>
                {!entry.built && <span className="sb-badge">{t('shell.comingSoon')}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
