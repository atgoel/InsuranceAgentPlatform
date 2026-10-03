import { useState } from 'react';
import { useT } from '../../../lib/i18n';
import { ApiError } from '../../../lib/api/api-error';

interface BulkAssignFormProps {
  leadIds: string[];
  onClose: () => void;
  onSubmitted: (leadIds: string[], memberId: string) => void;
}

export function BulkAssignForm({ leadIds, onClose, onSubmitted }: BulkAssignFormProps) {
  const { t } = useT();
  const [memberId, setMemberId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      if (!memberId) {
        setError(t('crm.leads.member_required'));
        return;
      }
      onSubmitted(leadIds, memberId);
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('crm.leads.bulk_assign')}</h2>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bulk-assign-form">
          <p className="form-info">
            {t('crm.leads.bulk_assign_count', { count: leadIds.length })}
          </p>

          <div className="form-group">
            <label htmlFor="memberId">{t('crm.leads.assign_to')} *</label>
            <input
              id="memberId"
              type="text"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder={t('crm.leads.member_id_placeholder')}
              required
            />
          </div>

          <div className="info-note">
            {t('crm.leads.bulk_assign_ineligible_note')}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('common.loading') : t('crm.leads.assign')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
