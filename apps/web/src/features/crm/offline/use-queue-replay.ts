import { useCallback, useEffect, useRef, useState } from 'react';
import type { CrmApi } from '../api';
import { ApiError } from '../../../lib/api/api-error';
import { isRetryable, LogQueue, QueuedLog } from './log-queue';

/**
 * Sends queued logs now if online, on mount, and on every `online` event — each with its original clientRef.
 * Success (201, or 200 for a duplicate clientRef) or a final rejection removes the entry; retryable failures keep it.
 */
export function useQueueReplay(crmApi: CrmApi, queue: LogQueue) {
  const [pending, setPending] = useState(() => queue.all().length);
  const [rejected, setRejected] = useState(0);
  const running = useRef(false);

  const replay = useCallback(async () => {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    try {
      for (const entry of queue.all()) {
        const outcome = await send(crmApi, entry);
        if (outcome !== 'retry') queue.remove(entry.clientRef);
        if (outcome === 'rejected') setRejected((n) => n + 1);
        if (outcome === 'retry') break; // still offline or the server is down: keep order, try again later
      }
    } finally {
      running.current = false;
      setPending(queue.all().length);
    }
  }, [crmApi, queue]);

  const enqueue = useCallback((entry: Omit<QueuedLog, 'clientRef'>) => {
    queue.add(entry);
    setPending(queue.all().length);
    void replay();
  }, [queue, replay]);

  useEffect(() => {
    void replay();
    const onOnline = () => void replay();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [replay]);

  return { pending, rejected, enqueue, replay };
}

async function send(crmApi: CrmApi, entry: QueuedLog): Promise<'sent' | 'retry' | 'rejected'> {
  try {
    await crmApi.logLeadActivity(entry.leadId, { kind: entry.kind, outcome: entry.outcome, occurredAt: entry.occurredAt, clientRef: entry.clientRef });
    return 'sent';
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0;
    if (status === 409) return 'sent';
    return isRetryable(status) ? 'retry' : 'rejected';
  }
}
