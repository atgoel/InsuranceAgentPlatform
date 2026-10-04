import { useCallback, useState } from 'react';
import { useT } from '../../../lib/i18n';
import type { IntegrationsApi, ReplayResult } from '../api';
import { useIntegrationAction, useIntegrationResource } from '../hooks';
import { IntegrationError } from './IntegrationError';

function ReplayNotice({ result }: { result?: ReplayResult }) {
  const { t } = useT();
  if (!result) {
    return null;
  }
  return (
    <div role="status">
      <p>{t(`integrations.replay_${result.result}`)}</p>
      {result.replacementId && <p>{t('integrations.replacement', { id: result.replacementId })}</p>}
    </div>
  );
}

export function DeadLetterDetail({ id, api, canWrite, onChange, close }: {
  id: string;
  api: IntegrationsApi;
  canWrite: boolean;
  onChange: () => void;
  close: () => void;
}) {
  const { t } = useT();
  const load = useCallback(() => api.detail(id), [api, id]);
  const resource = useIntegrationResource(load);
  const action = useIntegrationAction();
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<ReplayResult>();
  const [closed, setClosed] = useState(false);
  const detail = resource.data;
  const replay = () => action.run('replay', async key => {
    setResult(await api.replay(id, key));
    setClosed(true);
    resource.reload();
    onChange();
  });
  const discard = () => action.run(`discard:${reason.trim()}`, async key => {
    await api.discard(id, reason.trim(), key);
    setClosed(true);
    resource.reload();
    onChange();
  });
  return (
    <section aria-label={t('integrations.detail')} className="integration-detail">
      <h3>{t('integrations.detail')} · {id}</h3>
      <button onClick={close}>{t('integrations.close')}</button>
      {resource.loading && <p role="status">{t('integrations.loading')}</p>}
      <IntegrationError error={resource.error} retry={resource.reload} />
      {detail && !resource.error && <DetailContent detail={detail} canWrite={canWrite} />}
      {canWrite && !resource.error && detail?.entry.status === 'OPEN' && !closed && (
        <div>
          <button onClick={() => void replay()} disabled={action.busy || detail.payloadExpired}>{t('integrations.replay')}</button>
          <form onSubmit={event => {
            event.preventDefault();
            void discard();
          }}>
            <label>{t('integrations.reason')}
              <textarea value={reason} onChange={event => setReason(event.target.value)} required maxLength={500} />
            </label>
            <button disabled={action.busy || !reason.trim()}>{t('integrations.discard')}</button>
          </form>
        </div>
      )}
      <ReplayNotice result={result} />
      <IntegrationError error={action.error} />
    </section>
  );
}

function DetailContent({ detail, canWrite }: {
  detail: Awaited<ReturnType<IntegrationsApi['detail']>>;
  canWrite: boolean;
}) {
  const { t } = useT();
  return (
    <div>
      <p>{t(`integrations.${detail.entry.status}`)}</p>
      <p>{t('integrations.attempts', { count: detail.entry.attempts })}</p>
      <p>{t('integrations.error_code')}: {detail.entry.lastError}</p>
      <p>{t('integrations.payload_expiry')}: {detail.entry.payloadExpiresAt}</p>
      {detail.entry.discardReason && <p>{t('integrations.reason')}: {detail.entry.discardReason}</p>}
      {detail.payloadExpired && <p>{t('integrations.expired')}</p>}
      {canWrite && !detail.payloadExpired && detail.payload !== undefined && (
        <pre aria-label={t('integrations.payload')}>{JSON.stringify(detail.payload, null, 2)}</pre>
      )}
      {!canWrite && <p>{t('integrations.payload_restricted')}</p>}
    </div>
  );
}
