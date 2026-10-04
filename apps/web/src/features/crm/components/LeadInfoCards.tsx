import { formatIstDate } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { useLabel } from '../../../lib/i18n/labels';
import type { LeadDetailView } from '../api';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ContactCard({ lead }: { lead: LeadDetailView }) {
  const { t } = useT();
  const { contact } = lead;
  return (
    <section className="info-card" aria-label={t('crm.lead.contact_title')}>
      <h2>{t('crm.lead.contact_title')}</h2>
      <dl>
        <Row label={t('crm.lead.mobile')} value={contact?.mobileMasked ?? '—'} />
        <Row label={t('crm.lead.email')} value={contact?.emailMasked ?? '—'} />
        <Row label={t('crm.lead.pincode')} value={lead.pincode ?? '—'} />
      </dl>
    </section>
  );
}

export function ConsentCard({ lead }: { lead: LeadDetailView }) {
  const { t } = useT();
  return (
    <section className="info-card" aria-label={t('crm.lead.consent_title')}>
      <h2>{t('crm.lead.consent_title')}</h2>
      {lead.consentSummary.length === 0 && <p className="info-empty">{t('crm.lead.consent_none')}</p>}
      <dl>
        {lead.consentSummary.map((entry) => (
          <Row
            key={`${entry.purpose}-${entry.channel}`}
            label={`${t(`crm.consentPurpose.${entry.purpose}`)} · ${t(`crm.consentChannel.${entry.channel}`)}`}
            value={entry.granted ? t('crm.lead.consent_state_granted') : t('crm.lead.consent_not_given')}
          />
        ))}
      </dl>
    </section>
  );
}

function TouchRow({ label, channel, at }: { label: string; channel: string; at: string }) {
  const { lang } = useT();
  const channelLabel = useLabel('leadSource', channel);
  return <Row label={label} value={`${channelLabel} · ${formatIstDate(at, lang)}`} />;
}

export function AttributionCard({ lead }: { lead: LeadDetailView }) {
  const { t } = useT();
  const { firstTouch, lastTouch } = lead.attribution;
  return (
    <section className="info-card" aria-label={t('crm.lead.attribution_title')}>
      <h2>{t('crm.lead.attribution_title')}</h2>
      <dl>
        <TouchRow label={t('crm.lead.first_touch')} channel={firstTouch.channel} at={firstTouch.at} />
        <TouchRow label={t('crm.lead.last_touch')} channel={lastTouch.channel} at={lastTouch.at} />
      </dl>
      <p className="lead-info-note">{t('crm.lead.attribution_note')}</p>
    </section>
  );
}
