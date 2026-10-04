import { useMemo } from 'react';
import { Button } from '../../../design-system';
import { useApi } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { createPartyApi, type PartyListItem } from '../api';
import { roleSummaryText } from '../partyLabels';
import { usePartyHousehold } from '../useHouseholdMembers';
import { HouseholdMembers } from './HouseholdMembers';

interface HouseholdPanelProps {
  party: PartyListItem;
  onClose: () => void;
  onOpenRecord: () => void;
}

function HouseholdSection({ partyId, householdName }: { partyId: string; householdName?: string }) {
  const api = useApi();
  const partyApi = useMemo(() => createPartyApi(api), [api]);
  const { t } = useT();
  const loaded = usePartyHousehold(partyApi, partyId);

  if (loaded.status === 'loading') {
    return <p className="household-note">{t('common.loading')}</p>;
  }
  if (loaded.status === 'failed') {
    return (
      <p role="alert" className="household-note household-error">
        {loaded.title || t('common.error')}
      </p>
    );
  }
  if (!loaded.value) {
    return <p className="household-note">{t('party.customers.no_household')}</p>;
  }
  return (
    <>
      <p className="household-name-line">{loaded.value.name || householdName}</p>
      <HouseholdMembers household={loaded.value} />
    </>
  );
}

/** Household side panel (CRM04): members with relation and roles, and the way to the full record. */
export function HouseholdPanel({ party, onClose, onOpenRecord }: HouseholdPanelProps) {
  const { t } = useT();

  return (
    <aside className="household-panel" aria-label={t('party.customers.household_panel')}>
      <div className="panel-header">
        <h2>{party.displayName}</h2>
        <button type="button" className="close-button" onClick={onClose} aria-label={t('party.customers.close_panel')}>
          ×
        </button>
      </div>
      <div className="panel-content">
        <section className="panel-section">
          <h3>{t('party.customers.household_label')}</h3>
          <HouseholdSection partyId={party.id} householdName={party.householdName} />
        </section>
        {party.rolesSummary.length > 0 && (
          <section className="panel-section">
            <h3>{t('party.customers.roles_label')}</h3>
            <ul>
              {party.rolesSummary.map((role) => (
                <li key={role}>{roleSummaryText(t, role)}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="panel-actions">
        <Button variant="primary" onClick={onOpenRecord}>
          {t('party.customers.open_full_record')}
        </Button>
      </div>
    </aside>
  );
}
