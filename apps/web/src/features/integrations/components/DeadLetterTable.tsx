import { useCallback, useState } from 'react';
import { useT } from '../../../lib/i18n';
import type { DeadLetter, IntegrationsApi } from '../api';
import { useIntegrationResource } from '../hooks';
import { IntegrationError } from './IntegrationError';
import { DeadLetterDetail } from './DeadLetterDetail';

export function DeadLetterTable({ api, canWrite }: { api: IntegrationsApi; canWrite: boolean }) {
  const { t } = useT();
  const [status, setStatus] = useState<DeadLetter['status'] | ''>('OPEN');
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const load = useCallback(() => api.letters(status || undefined, cursor), [api, status, cursor]);
  const resource = useIntegrationResource(load);
  const changeStatus = (value: string) => {
    if (value === '' || value === 'OPEN' || value === 'REPLAYED' || value === 'DISCARDED') {
      setStatus(value);
      setCursor(undefined);
      setSelected(undefined);
    }
  };
  return (
    <section>
      <h2>{t('integrations.dead_letters')}</h2>
      <label>{t('integrations.status_filter')}
        <select value={status} onChange={event => changeStatus(event.target.value)}>
          <option value="">{t('integrations.all')}</option>
          {(['OPEN', 'REPLAYED', 'DISCARDED'] as const).map(value => (
            <option key={value} value={value}>{t(`integrations.${value}`)}</option>
          ))}
        </select>
      </label>
      {resource.loading && <p role="status">{t('integrations.loading')}</p>}
      <IntegrationError error={resource.error} retry={resource.reload} />
      {!resource.loading && resource.data?.items.length === 0 && <p>{t('integrations.no_dead_letters')}</p>}
      {resource.data && <LetterRows items={resource.data.items} inspect={setSelected} />}
      {resource.data?.nextCursor && (
        <button disabled={resource.loading} onClick={() => setCursor(resource.data?.nextCursor)}>{t('integrations.next')}</button>
      )}
      {cursor && <button onClick={() => setCursor(undefined)}>{t('integrations.first')}</button>}
      {selected && (
        <DeadLetterDetail key={selected} id={selected} api={api} canWrite={canWrite}
          onChange={resource.reload} close={() => setSelected(undefined)} />
      )}
    </section>
  );
}

function LetterRows({ items, inspect }: { items: DeadLetter[]; inspect: (id: string) => void }) {
  const { t } = useT();
  return (
    <table>
      <thead><tr>
        <th>{t('integrations.adapter')}</th><th>{t('integrations.operation')}</th><th>{t('integrations.status_filter')}</th>
        <th>{t('integrations.created')}</th><th>{t('integrations.actions')}</th>
      </tr></thead>
      <tbody>
        {items.map(entry => (
          <tr key={entry.id}>
            <td>{entry.adapterId} · {entry.adapterVersion}</td>
            <td>{t(`integrations.${entry.operation}`)}</td>
            <td>{t(`integrations.${entry.status}`)}</td>
            <td>{entry.createdAt}</td>
            <td><button onClick={() => inspect(entry.id)}>{t('integrations.inspect')}</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
