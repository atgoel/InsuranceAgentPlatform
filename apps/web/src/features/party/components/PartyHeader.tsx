import { useId } from 'react';
import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { ConsentSummaryItem, ContactabilityDecision, HouseholdView, PartyView } from '../api';
import { partyLabel } from '../partyLabels';
import { CreateOpportunityAction } from './CreateOpportunityAction';

interface PartyHeaderProps {
  party: PartyView & { household?: HouseholdView; consentSummary: ConsentSummaryItem[] };
  contactability: {
    whatsapp?: ContactabilityDecision;
    call?: ContactabilityDecision;
  };
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter((part) => part !== '')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** The notice version of the most recently recorded consent. */
function latestNoticeVersion(summary: ConsentSummaryItem[]): string | undefined {
  const latest = [...summary].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  return latest?.noticeVersion;
}

interface ContactActionProps {
  label: string;
  decision?: ContactabilityDecision;
}

/** A contact action that is disabled when contactability denies; the reason is visible text, not only a tooltip. */
function ContactAction({ label, decision }: ContactActionProps) {
  const { t } = useT();
  const reasonId = useId();
  const denied = decision !== undefined && !decision.allowed;

  return (
    <div className="contact-action">
      <Button variant={denied ? 'secondary' : 'primary'} disabled={denied} aria-describedby={denied ? reasonId : undefined}>
        {label}
      </Button>
      {denied && (
        <p id={reasonId} className="contact-reason">
          {t(`party.contactability.${decision.reason}`)}
        </p>
      )}
    </div>
  );
}

export function PartyHeader({ party, contactability }: PartyHeaderProps) {
  const { t } = useT();
  const notice = latestNoticeVersion(party.consentSummary);

  return (
    <section className="record-header" aria-label={t('party.record.header')}>
      <div className="initials-avatar" aria-hidden="true">
        {initialsOf(party.displayName)}
      </div>
      <div className="header-info">
        <h1>{party.displayName}</h1>
        {party.household && <p className="household-name">{party.household.name}</p>}
        <ul className="preferences">
          {party.ownerName && (
            <li>
              {t('party.record.owner')}: {party.ownerName}
            </li>
          )}
          <li>
            {t('party.record.language')}: {partyLabel(t, 'language', party.preferredLanguage)}
          </li>
          {party.preferredChannel && (
            <li>
              {t('party.record.channel')}: {partyLabel(t, 'preferredChannel', party.preferredChannel)}
            </li>
          )}
          {notice && <li>{t('party.record.consent_notice', { version: notice })}</li>}
        </ul>
      </div>
      <div className="header-actions">
        <ContactAction label={t('party.record.call_button')} decision={contactability.call} />
        <ContactAction label={t('party.record.whatsapp_button')} decision={contactability.whatsapp} />
        <CreateOpportunityAction partyId={party.id} />
      </div>
    </section>
  );
}
