import { useT } from '../../../lib/i18n';
import type { HouseholdView, PartyRoleLink } from '../api';
import { partyLabel } from '../partyLabels';
import { HouseholdMembers } from './HouseholdMembers';

interface OverviewTabProps {
  household?: HouseholdView;
  roles: PartyRoleLink[];
}

/** Household and roles (CRM09 Overview). */
export function OverviewTab({ household, roles }: OverviewTabProps) {
  const { t } = useT();

  return (
    <div className="overview-tab">
      {household && (
        <section className="section">
          <h2>{t('party.record.household_title')}</h2>
          <p className="household-name-line">{household.name}</p>
          <HouseholdMembers household={household} />
        </section>
      )}
      {roles.length > 0 && (
        <section className="section">
          <h2>{t('party.record.roles_title')}</h2>
          <ul>
            {roles.map((link) => (
              <li key={`${link.role}-${link.subjectType}-${link.subjectId}`}>
                {partyLabel(t, 'role', link.role)}
                {link.label && ` · ${link.label}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
