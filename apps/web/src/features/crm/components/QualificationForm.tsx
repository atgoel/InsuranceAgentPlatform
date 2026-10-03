import { useState } from 'react';
import { useT } from '../../../lib/i18n';
import { type Qualification } from '../api';

interface QualificationFormProps {
  qualification: Qualification;
  onSaved: (qualification: Qualification) => void;
}

export function QualificationForm({ qualification, onSaved }: QualificationFormProps) {
  const { t } = useT();
  const [formData, setFormData] = useState(qualification);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      onSaved(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="qualification-form">
      <div className="form-group">
        <label htmlFor="need">{t('crm.lead.need')}</label>
        <select
          id="need"
          value={formData.need || ''}
          onChange={(e) => setFormData({ ...formData, need: e.target.value as 'PROTECTION' | 'TAX_SAVING' | 'CHILD_EDUCATION' | 'RETIREMENT' | 'HEALTH_COVER' | 'VEHICLE' | undefined })}
        >
          <option value="">{t('crm.lead.select')}</option>
          <option value="PROTECTION">Protection</option>
          <option value="TAX_SAVING">Tax Saving</option>
          <option value="CHILD_EDUCATION">Child Education</option>
          <option value="RETIREMENT">Retirement</option>
          <option value="HEALTH_COVER">Health Cover</option>
          <option value="VEHICLE">Vehicle</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="budgetBand">{t('crm.lead.budget_band')}</label>
        <select
          id="budgetBand"
          value={formData.budgetBand || ''}
          onChange={(e) => setFormData({ ...formData, budgetBand: e.target.value as 'LT_15K' | '15K_30K' | 'GT_30K' | undefined })}
        >
          <option value="">{t('crm.lead.select')}</option>
          <option value="LT_15K">Less than ₹15K</option>
          <option value="15K_30K">₹15K - ₹30K</option>
          <option value="GT_30K">Greater than ₹30K</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="timeline">{t('crm.lead.timeline')}</label>
        <select
          id="timeline"
          value={formData.timeline || ''}
          onChange={(e) => setFormData({ ...formData, timeline: e.target.value as 'THIS_MONTH' | '1_3_MONTHS' | 'EXPLORING' | undefined })}
        >
          <option value="">{t('crm.lead.select')}</option>
          <option value="THIS_MONTH">This Month</option>
          <option value="1_3_MONTHS">1-3 Months</option>
          <option value="EXPLORING">Exploring</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="existingCover">{t('crm.lead.existing_cover')}</label>
        <textarea
          id="existingCover"
          value={formData.existingCover || ''}
          onChange={(e) => setFormData({ ...formData, existingCover: e.target.value })}
          maxLength={200}
          placeholder={t('crm.lead.existing_cover_placeholder')}
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? t('common.loading') : t('common.save')}
      </button>
    </form>
  );
}
