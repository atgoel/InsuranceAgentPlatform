import { useMemo } from 'react';
import { useApi } from '../../../lib/api';
import { usePermissions } from '../../../lib/auth';
import { useT } from '../../../lib/i18n';
import { createIntegrationsApi } from '../api';
import { useIntegrationResource } from '../hooks';
import { AdapterCard } from '../components/AdapterCard';
import { DeadLetterTable } from '../components/DeadLetterTable';
import { IntegrationError } from '../components/IntegrationError';
import '../styles.css';

export function IntegrationsScreen() {
  const apiClient = useApi();
  const api = useMemo(() => createIntegrationsApi(apiClient), [apiClient]);
  const { can } = usePermissions();
  const { t } = useT();
  const health = useIntegrationResource(api.list);
  const canWrite = can('integration.write');
  return (
    <main className="integrations-screen">
      <h1>{t('integrations.title')}</h1>
      {health.loading && <p role="status">{t('integrations.loading')}</p>}
      <IntegrationError error={health.error} retry={health.reload} />
      {!health.loading && health.data?.items.length === 0 && <p>{t('integrations.no_adapters')}</p>}
      {health.data && health.error?.status !== 403 && (
        <>
          <div className="integration-cards">
            {health.data.items.map(adapter => (
              <AdapterCard key={`${adapter.adapterId}:${adapter.adapterVersion}`} adapter={adapter} api={api}
                canWrite={canWrite} reload={health.reload} />
            ))}
          </div>
          <DeadLetterTable api={api} canWrite={canWrite} />
        </>
      )}
    </main>
  );
}
