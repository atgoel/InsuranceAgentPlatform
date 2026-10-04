import type { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';

export function IntegrationError({ error, retry }: { error?: ApiError; retry?: () => void }) {
  const { t } = useT();
  if (!error) {
    return null;
  }
  return (
    <div role="alert">
      <p>{error.status === 403 ? t('integrations.denied') : error.title}</p>
      {error.traceId && <p>{t('integrations.reference', { id: error.traceId })}</p>}
      {retry && <button onClick={retry}>{t('integrations.retry')}</button>}
    </div>
  );
}
