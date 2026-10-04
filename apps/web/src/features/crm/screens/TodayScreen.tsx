import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { ErrorState, LoadingSkeleton, PermissionDenied } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type MyWorkItem } from '../api';
import { LogQueue } from '../offline/log-queue';
import { useMyWork } from '../offline/use-my-work';
import { useQueueReplay } from '../offline/use-queue-replay';
import { LogSheet } from '../components/today/LogSheet';
import { TodayHeader } from '../components/today/TodayHeader';
import { WorkSections } from '../components/today/WorkSections';
import { firstNameOf } from '../components/today/today-greeting';
import '../styles/TodayScreen.css';

interface TodayScreenProps {
  /** Injected in tests; defaults to sessionStorage (cleared with the tab, never synced). */
  storage?: Storage;
  now?: () => Date;
}

function routeFor(item: MyWorkItem): string {
  if (item.kind === 'DUE') return `/m/dues?policyId=${encodeURIComponent(item.subject.id)}`;
  if (item.subject.type === 'SERVICING_REQUEST') return '/m/servicing';
  return `/m/leads/${item.subject.id}`;
}

/** M01 Today, CRM part (AC-M04-29): date, greeting, KPIs, dues and my-work with one-tap actions, offline cache and queued logs. */
export function TodayScreen({ storage = sessionStorage, now = () => new Date() }: TodayScreenProps) {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const queue = useMemo(() => new LogQueue(storage), [storage]);
  const { t } = useT();
  const navigate = useNavigate();
  const work = useMyWork(crmApi, storage);
  const { pending, rejected, enqueue } = useQueueReplay(crmApi, queue);
  const [logging, setLogging] = useState<MyWorkItem | undefined>();
  const [search, setSearch] = useState('');
  const name = useMemo(() => firstNameOf(), []);
  const query = search.trim().toLowerCase();
  const items = useMemo(() => work.items.filter((i) => i.title.toLowerCase().includes(query)), [work.items, query]);

  if (work.loading) return <LoadingSkeleton />;
  if (work.error?.status === 403) return <PermissionDenied />;
  if (work.error) return <ErrorState error={work.error} />;

  return (
    <main className="today-screen">
      <TodayHeader now={now()} name={name} counts={work.counts} search={search} onSearch={setSearch} />
      {work.offline && <div role="status" className="offline-banner">{t('today.offline_cached')}</div>}
      {pending > 0 && <div role="status" className="queue-banner">{t('today.logs_pending', { count: pending })}</div>}
      {rejected > 0 && <div role="alert" className="queue-banner">{t('today.logs_rejected', { count: rejected })}</div>}
      <WorkSections items={items} filtered={query !== ''} onOpen={(i) => navigate(routeFor(i))} onLog={setLogging} />
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
