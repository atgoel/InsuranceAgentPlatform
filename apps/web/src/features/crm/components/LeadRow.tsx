import { Link } from 'react-router-dom';
import { StatusChip, formatIstDate, type Tone } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { useLabel } from '../../../lib/i18n/labels';
import type { LeadListItem } from '../api';

const SLA_TONE: Record<LeadListItem['slaState'], Tone> = { met: 'ok', breached: 'bad', pending: 'warn', none: 'neutral' };

interface LeadRowProps {
  item: LeadListItem;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}

/** One grid row: name with masked-mobile and date sub-line, then labelled codes. */
export function LeadRow({ item, selected, onToggle }: LeadRowProps) {
  const { t, lang } = useT();
  const product = useLabel('line', item.productInterest);
  const source = useLabel('leadSource', item.source);
  const stage = useLabel('leadStage', item.stage);
  const created = formatIstDate(item.createdAt, lang);
  const subline = item.mobileMasked ? `${item.mobileMasked} · ${created}` : created;

  return (
    <tr className="lead-row">
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={t('crm.leads.select_named', { name: item.name })}
        />
      </td>
      <td>
        <Link to={`/crm/leads/${item.id}`}>{item.name}</Link>
        <div className="lead-subline">{subline}</div>
      </td>
      <td>{product}</td>
      <td>{source}</td>
      <td>{item.ownerName || '—'}</td>
      <td>{stage}</td>
      <td>
        <StatusChip tone={SLA_TONE[item.slaState]}>{t(`crm.leads.sla_state.${item.slaState}`)}</StatusChip>
      </td>
      <td>
        <StatusChip tone={item.consent === 'granted' ? 'ok' : 'warn'}>{t(`crm.leads.consent_state.${item.consent}`)}</StatusChip>
      </td>
    </tr>
  );
}
