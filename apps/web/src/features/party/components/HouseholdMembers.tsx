import { useMemo } from 'react';
import { useApi } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { createPartyApi, type HouseholdView } from '../api';
import { partyLabel, roleSummaryText } from '../partyLabels';
import { useHouseholdPeople } from '../useHouseholdMembers';

interface HouseholdMembersProps {
  household: HouseholdView;
}

/** Members of a household with relation and roles; a failed load is shown here, never in place of the screen. */
export function HouseholdMembers({ household }: HouseholdMembersProps) {
  const api = useApi();
  const partyApi = useMemo(() => createPartyApi(api), [api]);
  const { t } = useT();
  const people = useHouseholdPeople(partyApi, household);

  if (people.status === 'loading') {
    return <p className="household-note">{t('common.loading')}</p>;
  }
  if (people.status === 'failed') {
    return (
      <p role="alert" className="household-note household-error">
        {people.title || t('common.error')}
      </p>
    );
  }
  return (
    <ul className="household-members">
      {people.value.map((member) => (
        <li key={member.partyId} className="household-member">
          <span className="household-member-name">{member.name}</span>
          <span className="household-member-relation">{partyLabel(t, 'relation', member.relation)}</span>
          {member.roles.length > 0 && (
            <span className="household-member-roles">{member.roles.map((r) => roleSummaryText(t, r)).join(', ')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
