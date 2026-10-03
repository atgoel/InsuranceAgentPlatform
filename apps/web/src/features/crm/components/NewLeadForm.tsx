import { useState, useMemo } from 'react';
import { useApi } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type ProductLine, type LeadSource } from '../api';
import { ApiError } from '../../../lib/api/api-error';

interface NewLeadFormProps {
  onClose: () => void;
  onSubmitted: (leadId: string) => void;
}

export function NewLeadForm({ onClose, onSubmitted }: NewLeadFormProps) {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();

  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [productInterest, setProductInterest] = useState<ProductLine>('TERM_LIFE');
  const [source, setSource] = useState<LeadSource>('WEB_FORM');
  const [consentGranted, setConsentGranted] = useState(false);
  const [consentChannels, setConsentChannels] = useState<Array<'CALL' | 'WHATSAPP'>>(['CALL']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      const result = await crmApi.createLead({
        fullName,
        mobile: mobile || undefined,
        email: email || undefined,
        productInterest,
        source,
        consent: {
          granted: consentGranted,
          noticeVersion: 'v2',
          channels: consentChannels,
          purposes: ['SERVICE', 'MARKETING'],
        },
      });

      onSubmitted(result.leadId);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('common.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChannelToggle = (channel: 'CALL' | 'WHATSAPP') => {
    setConsentChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('crm.leads.new_lead')}</h2>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="new-lead-form">
          <div className="form-group">
            <label htmlFor="fullName">{t('crm.lead.name')} *</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
          </div>

          <div className="form-group">
            <label htmlFor="mobile">{t('crm.lead.mobile')}</label>
            <input
              id="mobile"
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              maxLength={20}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">{t('crm.lead.email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="form-group">
            <label htmlFor="product">{t('crm.lead.product')} *</label>
            <select value={productInterest} onChange={(e) => setProductInterest(e.target.value as ProductLine)}>
              <option value="TERM_LIFE">Term Life</option>
              <option value="SAVINGS_LIFE">Savings Life</option>
              <option value="HEALTH">Health</option>
              <option value="HEALTH_FLOATER">Health Floater</option>
              <option value="CHILD">Child</option>
              <option value="RETIREMENT">Retirement</option>
              <option value="MOTOR">Motor</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="source">{t('crm.lead.source')} *</label>
            <select value={source} onChange={(e) => setSource(e.target.value as LeadSource)}>
              <option value="WEB_FORM">Web Form</option>
              <option value="MICROSITE">Microsite</option>
              <option value="REFERRAL">Referral</option>
              <option value="WALK_IN">Walk In</option>
              <option value="PHONE">Phone</option>
              <option value="EVENT">Event</option>
              <option value="CAMPAIGN">Campaign</option>
            </select>
          </div>

          <fieldset className="consent-fieldset">
            <legend>{t('crm.lead.consent_title')}</legend>
            <div className="form-group checkbox">
              <input
                id="consentGranted"
                type="checkbox"
                checked={consentGranted}
                onChange={(e) => setConsentGranted(e.target.checked)}
              />
              <label htmlFor="consentGranted">
                {t('crm.lead.consent_granted')}
                <span className="notice-version">{t('crm.lead.consent_notice_v2')}</span>
              </label>
            </div>

            <div className="channels">
              <label className="channel-checkbox">
                <input
                  type="checkbox"
                  checked={consentChannels.includes('CALL')}
                  onChange={() => handleChannelToggle('CALL')}
                />
                {t('crm.lead.channel_call')}
              </label>
              <label className="channel-checkbox">
                <input
                  type="checkbox"
                  checked={consentChannels.includes('WHATSAPP')}
                  onChange={() => handleChannelToggle('WHATSAPP')}
                />
                {t('crm.lead.channel_whatsapp')}
              </label>
            </div>
          </fieldset>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('common.loading') : t('crm.leads.create_and_route')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
