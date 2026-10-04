import { Button, StatusChip, formatIstDate } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { ConsentSummaryItem } from '../api';
import { partyLabel } from '../partyLabels';

interface ConsentTabProps {
  summary: ConsentSummaryItem[];
  onRecord: () => void;
}

/** Consent per purpose and channel with Granted or Withdrawn and the date, plus the record-consent action. */
export function ConsentTab({ summary, onRecord }: ConsentTabProps) {
  const { t, lang } = useT();

  return (
    <div className="consent-tab">
      <ul className="consent-summary">
        {summary.map((item) => (
          <li key={`${item.purpose}-${item.channel}`} className="consent-item">
            <span className="consent-label">
              {partyLabel(t, 'purpose', item.purpose)} · {partyLabel(t, 'consentChannel', item.channel)}
            </span>
            <StatusChip tone={item.granted ? 'ok' : 'bad'}>
              {item.granted ? t('party.record.consent_granted') : t('party.record.consent_withdrawn')}
            </StatusChip>
            <span className="consent-date">{formatIstDate(item.occurredAt, lang)}</span>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={onRecord}>
        {t('party.record.record_consent')}
      </Button>
    </div>
  );
}
