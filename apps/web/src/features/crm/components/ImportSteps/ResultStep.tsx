import { useT } from '../../../../lib/i18n';
import { type LeadImportResult } from '../../api';

interface ResultStepProps {
  result: LeadImportResult;
  onViewDuplicates: () => void;
  onClose: () => void;
}

export function ResultStep({ result, onViewDuplicates, onClose }: ResultStepProps) {
  const { t } = useT();

  return (
    <div className="import-step">
      <h2>{t('crm.import.step_result')}</h2>

      <div className="result-summary">
        <div className="result-card success">
          <div className="result-number">{result.imported}</div>
          <div className="result-label">{t('crm.import.result_imported')}</div>
        </div>

        {result.duplicates > 0 && (
          <div className="result-card info">
            <div className="result-number">{result.duplicates}</div>
            <div className="result-label">{t('crm.import.result_duplicates')}</div>
          </div>
        )}

        {result.skippedAlreadyImported > 0 && (
          <div className="result-card warning">
            <div className="result-number">{result.skippedAlreadyImported}</div>
            <div className="result-label">{t('crm.import.result_already_imported')}</div>
          </div>
        )}

        {result.rejected > 0 && (
          <div className="result-card error">
            <div className="result-number">{result.rejected}</div>
            <div className="result-label">{t('crm.import.result_rejected')}</div>
          </div>
        )}
      </div>

      <div className="result-details">
        <h3>{t('crm.import.batch_id')}</h3>
        <code>{result.batchId}</code>
      </div>

      <div className="result-message">
        <p>{t('crm.import.rerun_note')}</p>
      </div>

      {result.duplicates > 0 && (
        <div className="duplicates-link">
          <p>{t('crm.import.view_duplicates_text')}</p>
          <button className="btn btn-secondary" onClick={onViewDuplicates}>
            {t('crm.import.view_duplicates_button')}
          </button>
        </div>
      )}

      <div className="form-actions">
        <button className="btn btn-primary" onClick={onClose}>
          {t('crm.import.return_to_leads')}
        </button>
      </div>
    </div>
  );
}
