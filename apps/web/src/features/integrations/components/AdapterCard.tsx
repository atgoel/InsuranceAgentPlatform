import { useState } from 'react';
import { useT } from '../../../lib/i18n';
import type { AdapterHealth, IntegrationsApi, Certification } from '../api';
import { useIntegrationAction } from '../hooks';
import { IntegrationError } from './IntegrationError';

function snapshotValue<T>(server: T, override?: {
  source: T;
  value: T;
}): T {
  if (!override || override.source !== server) {
    return server;
  }
  return override.value ?? server;
}

function CertificationResults({ certification }: { certification?: Certification }) {
  const { t } = useT();
  if (!certification) {
    return <p>{t('integrations.uncertified')}</p>;
  }
  return (
    <div>
      <p>{t(`integrations.${certification.status}`)} · {certification.adapterVersion}</p>
      <ul>
        {certification.checks.map(check => (
          <li key={check.kind}>
            {t(`integrations.${check.kind}`)}: {t(check.passed ? 'integrations.PASSED' : 'integrations.FAILED')}
            {check.code && <span> · {check.code}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AdapterDiagnostics({ adapter }: { adapter: AdapterHealth }) {
  const { t } = useT();
  const probe = adapter.lastProbe;
  return (
    <div>
      {adapter.breakers.map(breaker => (
        <p key={breaker.operation}>{t(`integrations.${breaker.operation}`)}: {t(`integrations.${breaker.state}`)}</p>
      ))}
      {probe ? (
        <div>
          <p>{t('integrations.probe')}: {probe.at} · {t(`integrations.${probe.outcome}`)}</p>
          <p>{t('integrations.latency', { ms: probe.latencyMs })}</p>
          {probe.p95Ms !== undefined && <p>{t('integrations.p95', { ms: probe.p95Ms })}</p>}
          {probe.lastOkAt && <p>{t('integrations.last_ok')}: {probe.lastOkAt}</p>}
        </div>
      ) : <p>{t('integrations.no_probe')}</p>}
    </div>
  );
}

export function AdapterCard({ adapter, api, canWrite, reload }: {
  adapter: AdapterHealth;
  api: IntegrationsApi;
  canWrite: boolean;
  reload: () => void;
}) {
  const { t } = useT();
  const [version, setVersion] = useState(adapter.pin?.version ?? adapter.adapterVersion);
  const [certificationOverride, setCertificationOverride] = useState<{
    source: AdapterHealth['certification'];
    value: Certification;
  }>();
  const [pinOverride, setPinOverride] = useState<{
    source: AdapterHealth['pin'];
    value: NonNullable<AdapterHealth['pin']>;
  }>();
  const certification = snapshotValue(adapter.certification, certificationOverride);
  const pin = snapshotValue(adapter.pin, pinOverride);
  const action = useIntegrationAction();
  const savePin = () => action.run(`pin:${version.trim()}`, async () => {
    setPinOverride({ source: adapter.pin, value: await api.pin(adapter.adapterId, version.trim()) });
    reload();
  });
  const certify = () => action.run(`certify:${pin?.version ?? adapter.adapterVersion}`, async key => {
    setCertificationOverride({ source: adapter.certification, value: await api.certify(adapter.adapterId, key) });
    reload();
  });
  return (
    <article aria-label={adapter.counterparty.name} className="integration-card">
      <h2>{adapter.counterparty.name}</h2>
      <p>{t('integrations.version')}: {adapter.adapterVersion}</p>
      <p>{t('integrations.pin')}: {pin?.version ?? t('integrations.not_pinned')}</p>
      <CertificationResults certification={certification} />
      <AdapterDiagnostics adapter={adapter} />
      {canWrite && (
        <div>
          <form onSubmit={event => {
            event.preventDefault();
            void savePin();
          }}>
            <label>{t('integrations.pin_version')}
              <input value={version} onChange={event => setVersion(event.target.value)} required />
            </label>
            <button disabled={action.busy || !version.trim()}>{t('integrations.save_pin')}</button>
          </form>
          <button onClick={() => void certify()} disabled={action.busy}>{t('integrations.certify')}</button>
        </div>
      )}
      <IntegrationError error={action.error} />
    </article>
  );
}
