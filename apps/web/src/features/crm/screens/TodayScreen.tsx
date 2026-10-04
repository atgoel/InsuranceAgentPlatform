import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { ErrorState, LoadingSkeleton, PermissionDenied } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type MyWorkItem } from '../api';
import { LogQueue } from '../offline/log-queue';
import { useMyWork } from '../offline/use-my-work';
import { useQueueReplay } from '../offline/use-queue-replay';
import { WorkItemRow } from '../components/today/WorkItemRow';
import { LogSheet } from '../components/today/LogSheet';
import '../styles/TodayScreen.css';

interface TodayScreenProps {
  /** Injected in tests; defaults to sessionStorage (cleared with the tab, never synced). */
  storage?: Storage;
  now?: () => Date;
}

/** M01 Today, CRM part (AC-M04-29): counts, my-work with one-tap actions, EN/हि, offline cache and queued logs. */
export function TodayScreen({ storage = sessionStorage, now = () => new Date() }: TodayScreenProps) {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const queue = useMemo(() => new LogQueue(storage), [storage]);
  const { t, lang, setLang } = useT();
  const navigate = useNavigate();
  const work = useMyWork(crmApi, storage);
  const { pending, rejected, enqueue } = useQueueReplay(crmApi, queue);
  const [logging, setLogging] = useState<MyWorkItem | undefined>();

  if (work.loading) return <LoadingSkeleton />;
  if (work.error?.status === 403) return <PermissionDenied />;
  if (work.error) return <ErrorState error={work.error} />;

  return (
    <main className="today-screen">
      <header className="today-header">
        <h1>{t('today.greeting')}</h1>
        <div role="group" aria-label={t('today.language')}>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
          <button type="button" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')}>हि</button>
        </div>
      </header>
      {work.offline && <div role="status" className="offline-banner">{t('today.offline_cached')}</div>}
      {pending > 0 && <div role="status" className="queue-banner">{t('today.logs_pending', { count: pending })}</div>}
      {rejected > 0 && <div role="alert" className="queue-banner">{t('today.logs_rejected', { count: rejected })}</div>}
      <dl className="counts-grid">
        {(['overdue', 'today', 'hotLeads'] as const).map((k) => (
          <div key={k} className="count-tile"><dt>{t(`today.${k}`)}</dt><dd>{work.counts[k]}</dd></div>
        ))}
      </dl>
      {work.items.length === 0 ? (
        <p className="empty-message">{t('today.noWork')}</p>
      ) : (
        <ul className="my-work-list">
          {work.items.map((item) => (
            <WorkItemRow key={`${item.kind}-${item.id}`} item={item} onOpen={(i) => navigate(i.kind === 'DUE' ? `/m/dues?policyId=${encodeURIComponent(i.subject.id)}` : i.subject.type === 'SERVICING_REQUEST' ? '/m/servicing' : `/m/leads/${i.subject.id}`)} onLog={setLogging} />
          ))}
        </ul>
      )}
      {logging && (
        <LogSheet
          title={logging.title}
          onClose={() => setLogging(undefined)}
          onLog={(entry) => {
            enqueue({ leadId: logging.subject.id, ...entry, occurredAt: now().toISOString() });
            setLogging(undefined);
          }}
        />
      )}
    </main>
  );
}
