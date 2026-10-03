import { Link } from 'react-router-dom';
import { StatusChip } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { LeadListItem } from '../../api';

/** A lead on the phone: name, product, stage and SLA at a glance; tapping opens the mobile lead record. */
export function LeadCard({ lead }: { lead: LeadListItem }) {
  const { t } = useT();
  return (
    <li className="lead-card">
      <Link to={`/m/leads/${lead.id}`} className="lead-card-link">
        <span className="lead-name">{lead.name}</span>
        <span className="lead-product">{t(`crm.product.${lead.productInterest}`)}</span>
      </Link>
      <span className="lead-chips">
        <StatusChip tone="neutral">{t(`crm.lead.stage_${lead.stage}`)}</StatusChip>
        {lead.slaState === 'breached' && <StatusChip tone="bad">{t('crm.leads.view.sla_breached')}</StatusChip>}
      </span>
    </li>
  );
}
