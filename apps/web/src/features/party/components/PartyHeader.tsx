import { Button } from '../../../design-system';
import { PartyView, HouseholdView, ContactabilityDecision } from '../api';
import { useT } from '../../../lib/i18n';

interface PartyHeaderProps {
  party: PartyView & { household?: HouseholdView };
  contactability: {
    whatsapp?: ContactabilityDecision;
    call?: ContactabilityDecision;
  };
}

export function PartyHeader({ party, contactability }: PartyHeaderProps) {
  const { t } = useT();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const whatsappDisabled = contactability.whatsapp && !contactability.whatsapp.allowed;
  const callDisabled = contactability.call && !contactability.call.allowed;

  return (
    <div className="record-header">
      <div className="header-content">
        <div className="initials-avatar">{getInitials(party.displayName)}</div>
        <div className="header-info">
          <h1>{party.displayName}</h1>
          {party.household && <p className="household-name">{party.household.name}</p>}
          <div className="preferences">
            <span className="preference">
              {t('party.record.language')}: {party.preferredLanguage}
            </span>
            {party.preferredChannel && (
              <span className="preference">
                {t('party.record.channel')}: {party.preferredChannel}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="header-actions">
        <Button
          variant={callDisabled ? 'secondary' : 'primary'}
          disabled={callDisabled}
          title={callDisabled ? contactability.call?.reason : undefined}
        >
          {t('party.record.call_button')}
        </Button>
        <Button
          variant={whatsappDisabled ? 'secondary' : 'primary'}
          disabled={whatsappDisabled}
          title={whatsappDisabled ? contactability.whatsapp?.reason : undefined}
        >
          {t('party.record.whatsapp_button')}
        </Button>
      </div>
    </div>
  );
}
