import { useState } from 'react';
import { useT } from '../../../lib/i18n';
import { type LeadDetailView, type ProductLine, type OpportunityStage } from '../api';

interface ConvertSheetProps {
  lead: LeadDetailView;
  onConvert: (conversion: { partyChoice: 'LEAD_PARTY' | { existingPartyId: string }; productInterest: ProductLine; expectedPremiumPaise: number; startStage: OpportunityStage }) => void;
}

export function ConvertSheet({ lead, onConvert }: ConvertSheetProps) {
  const { t } = useT();
  const [partyChoice, setPartyChoice] = useState<'LEAD_PARTY' | 'EXISTING'>('LEAD_PARTY');
  const [existingPartyId, setExistingPartyId] = useState('');
  const [productInterest, setProductInterest] = useState<ProductLine>(lead.productInterest);
  const [expectedPremiumPaise, setExpectedPremiumPaise] = useState('');
  const [startStage, setStartStage] = useState<'DISCOVERY' | 'QUOTE_SHARED'>('DISCOVERY');
  const [loading, setLoading] = useState(false);

  const isDisabled = lead.stage !== 'QUALIFIED';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      onConvert({
        partyChoice: partyChoice === 'LEAD_PARTY' ? 'LEAD_PARTY' : { existingPartyId },
        productInterest,
        expectedPremiumPaise: parseInt(expectedPremiumPaise, 10),
        startStage,
      });
    } finally {
      setLoading(false);
    }
  };

  if (isDisabled) {
    return (
      <div className="convert-sheet disabled">
        <p className="disabled-message">{t('crm.lead.convert_disabled')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="convert-sheet">
      <fieldset>
        <legend>{t('crm.lead.party_choice')}</legend>
        <label className="radio-option">
          <input
            type="radio"
            value="LEAD_PARTY"
            checked={partyChoice === 'LEAD_PARTY'}
            onChange={(e) => setPartyChoice(e.target.value as 'LEAD_PARTY')}
          />
          {t('crm.lead.create_new_party')}
        </label>
        <label className="radio-option">
          <input
            type="radio"
            value="EXISTING"
            checked={partyChoice === 'EXISTING'}
            onChange={() => setPartyChoice('EXISTING')}
          />
          {t('crm.lead.link_existing_party')}
        </label>
      </fieldset>

      {partyChoice === 'EXISTING' && (
        <div className="form-group">
          <label htmlFor="existingPartyId">{t('crm.lead.existing_party_id')} *</label>
          <input
            id="existingPartyId"
            type="text"
            value={existingPartyId}
            onChange={(e) => setExistingPartyId(e.target.value)}
            required={partyChoice === 'EXISTING'}
          />
        </div>
      )}

      <div className="form-group">
        <label htmlFor="productInterest">{t('crm.lead.product')} *</label>
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
        <label htmlFor="expectedPremium">{t('crm.lead.expected_premium_rupees')} *</label>
        <input
          id="expectedPremium"
          type="number"
          value={expectedPremiumPaise}
          onChange={(e) => setExpectedPremiumPaise(e.target.value)}
          required
          min="0"
        />
        <small>{t('crm.lead.premium_paise_note')}</small>
      </div>

      <div className="form-group">
        <label htmlFor="startStage">{t('crm.lead.start_stage')} *</label>
        <select value={startStage} onChange={(e) => setStartStage(e.target.value as 'DISCOVERY' | 'QUOTE_SHARED')}>
          <option value="DISCOVERY">Discovery</option>
          <option value="QUOTE_SHARED">Quote Shared</option>
        </select>
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? t('common.loading') : t('crm.lead.convert')}
      </button>
    </form>
  );
}
