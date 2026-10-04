import { Link } from 'react-router-dom';
import { StatusChip, formatIstDate } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { LeadListItem } from '../../api';
import { LabelText } from '../LabelText';

const TEMPERATURE_TONE = { HOT: 'bad', WARM: 'warn', COLD: 'info' } as const;

/** A lead on the phone: name, product, source, stage and SLA at a glance; tapping opens the mobile lead record. */
export function LeadCard({ lead }: { lead: LeadListItem }) {
  const { t, lang } = useT();
  return (
    <li className="lead-card">
      <Link to={`/m/leads/${lead.id}`} className="lead-card-link">
        <span className="lead-name">{lead.name}</span>
        <span className="lead-meta">
          <span className="lead-product"><LabelText kind="line" code={lead.productInterest} /></span>
          <span className="lead-source"><LabelText kind="leadSource" code={lead.source} /></span>
          <span className="lead-created">{formatIstDate(lead.createdAt, lang)}</span>
        </span>
        {lead.mobileMasked && <span className="lead-mobile">{lead.mobileMasked}</span>}
      </Link>
      <span className="lead-chips">
        <StatusChip tone={TEMPERATURE_TONE[lead.temperature]}>{t(`crm.temperature.${lead.temperature}`)}</StatusChip>
        <StatusChip tone="neutral"><LabelText kind="leadStage" code={lead.stage} /></StatusChip>
        {lead.slaState === 'breached' && <StatusChip tone="bad">{t('crm.leads.view.sla_breached')}</StatusChip>}
      </span>
    </li>
  );
}
