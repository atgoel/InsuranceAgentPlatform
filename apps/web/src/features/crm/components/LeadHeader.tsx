import { useT } from '../../../lib/i18n';
import { type LeadDetailView } from '../api';

interface LeadHeaderProps {
  lead: LeadDetailView;
}

export function LeadHeader({ lead }: LeadHeaderProps) {
  const { t } = useT();

  return (
    <div className="lead-header">
      <div className="lead-title">
        <h1>{lead.name}</h1>
        <span className={`temperature-chip temp-${lead.temperature}`}>{lead.temperature}</span>
      </div>
      <div className="lead-meta">
        <div className="meta-item">
          <span className="label">{t('crm.lead.product')}:</span>
          <span>{lead.productInterest}</span>
        </div>
        <div className="meta-item">
          <span className="label">{t('crm.lead.source')}:</span>
          <span>{lead.source}</span>
        </div>
        <div className="meta-item">
          <span className="label">{t('crm.lead.created')}:</span>
          <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
        </div>
        {lead.contact?.mobileMasked && (
          <div className="meta-item">
            <span className="label">{t('crm.lead.mobile')}:</span>
            <span>{lead.contact.mobileMasked}</span>
          </div>
        )}
      </div>
    </div>
  );
}
