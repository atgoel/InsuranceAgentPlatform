import { Button } from '../Button';
import { useT } from '../../lib/i18n';
import './ErrorState.css';
import { ApiError } from '../../lib/api/api-error';

export { ApiError };

export interface ErrorStateProps {
  error: ApiError | Error;
  onRetry?(): void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { t } = useT();
  const isApiError = error instanceof ApiError;
  const traceId = isApiError ? error.traceId : undefined;
  const traceRef = traceId ? traceId.substring(0, 8) : '';

  const copyTrace = () => {
    if (traceId) {
      navigator.clipboard.writeText(traceId);
    }
  };

  return (
    <div className="error-state">
      <div className="error-state-icon">⚠️</div>
      <h2 className="error-state-title">{t('common.error')}</h2>
      {isApiError && error.detail && <p className="error-state-detail">{error.detail}</p>}
      {traceRef && (
        <div className="error-state-trace">
          <span>{t('ds.error.reference', { ref: traceRef })}</span>
          <button onClick={copyTrace} aria-label={t('ds.error.copyTrace')} className="copy-button">
            📋
          </button>
        </div>
      )}
      {onRetry && (
        <Button onClick={onRetry} size="lg">
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
