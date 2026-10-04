import { useEffect, useState } from 'react';
import type { CrmApi, MyWorkItem } from '../api';
import { ApiError } from '../../../lib/api/api-error';

export interface MyWorkCounts {
  overdue: number;
  today: number;
  hotLeads: number;
}
interface Cached {
  items: MyWorkItem[];
  counts: MyWorkCounts;
}

const CACHE_KEY = 'crm:today-cache:v1';

/** Only these fields are cached: no subtitle (it can carry product or customer details), never contact data. */
export function toCacheable(item: MyWorkItem): MyWorkItem {
  return {
    kind: item.kind,
    id: item.id,
    title: item.title,
    dueAt: item.dueAt,
    priority: item.priority,
    subject: { type: item.subject.type, id: item.subject.id },
    actions: [...item.actions],
  };
}

function readCache(storage: Storage): Cached | undefined {
  try {
    const parsed = JSON.parse(storage.getItem(CACHE_KEY) ?? 'null') as Cached | null;
    return parsed && Array.isArray(parsed.items) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Today's my-work list. A network failure (or being offline) serves the last cached list with `offline: true`;
 * HTTP errors (401/403/5xx with a response) are shown as errors.
 */
export function useMyWork(crmApi: CrmApi, storage: Storage = sessionStorage) {
  const [state, setState] = useState<{ loading: boolean; error?: ApiError; offline: boolean; items: MyWorkItem[]; counts: MyWorkCounts }>({
    loading: true,
    offline: false,
    items: [],
    counts: { overdue: 0, today: 0, hotLeads: 0 },
  });

  useEffect(() => {
    let cancelled = false;
    crmApi.getMyWork().then(
      (result) => {
        if (cancelled) return;
        storage.setItem(CACHE_KEY, JSON.stringify({ items: result.items.map(toCacheable), counts: result.counts }));
        setState({ loading: false, offline: false, items: result.items, counts: result.counts });
      },
      (err: unknown) => {
        if (cancelled) return;
        const networkFailure = !(err instanceof ApiError) || err.status === 0 || !navigator.onLine;
        const cached = networkFailure ? readCache(storage) : undefined;
        if (cached) setState({ loading: false, offline: true, items: cached.items, counts: cached.counts });
        else
          setState((s) => ({
            ...s,
            loading: false,
            error: err instanceof ApiError ? err : ApiError.network(err instanceof Error ? err : new Error(String(err))),
          }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [crmApi, storage]);

  return state;
}
