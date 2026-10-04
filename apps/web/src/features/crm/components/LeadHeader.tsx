import { PageHeader, StatusChip, formatIstDate, type Tone } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { useLabel } from '../../../lib/i18n/labels';
import { type LeadDetailView, type Temperature } from '../api';

interface LeadHeaderProps {
  lead: LeadDetailView;
}

const TEMPERATURE_TONE: Record<Temperature, Tone> = { HOT: 'bad', WARM: 'warn', COLD: 'info' };

/** Back link, name with temperature and stage chips, and the product, source and created meta (CRM02). */
export function LeadHeader({ lead }: LeadHeaderProps) {
  const { t, lang } = useT();
  const product = useLabel('line', lead.productInterest);
  const source = useLabel('leadSource', lead.source);
  const stage = useLabel('leadStage', lead.stage);

  return (
    <div className="lead-header">
      <PageHeader
        title={lead.name}
        back={{ to: '/crm/leads', label: t('crm.lead.back') }}
        actions={
          <div className="lead-chips">
            <StatusChip tone={TEMPERATURE_TONE[lead.temperature]}>{t(`crm.temperature.${lead.temperature}`)}</StatusChip>
            <StatusChip tone="neutral">{stage}</StatusChip>
          </div>
        }
      />
      <div className="lead-meta">
        <div className="meta-item">
          <span className="label">{t('crm.lead.product')}</span>
          <span>{product}</span>
        </div>
        <div className="meta-item">
          <span className="label">{t('crm.lead.source')}</span>
          <span>{source}</span>
        </div>
        <div className="meta-item">
          <span className="label">{t('crm.lead.created')}</span>
          <span>{formatIstDate(lead.createdAt, lang)}</span>
        </div>
        {lead.contact?.mobileMasked && (
          <div className="meta-item">
            <span className="label">{t('crm.lead.mobile')}</span>
            <span>{lead.contact.mobileMasked}</span>
          </div>
        )}
      </div>
    </div>
  );
}
