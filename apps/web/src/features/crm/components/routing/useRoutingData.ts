import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../../lib/api/api-error';
import type { CapacityRow, CrmApi, RoutingRule } from '../../api';

export interface RoutingData {
  rules?: RoutingRule[];
  capacity: CapacityRow[];
  error?: ApiError;
  setRules: (rules: RoutingRule[]) => void;
  reload: () => void;
}

/** Rules (GET /routing-rules, in priority order) and the capacity table (GET /routing/capacity). */
export function useRoutingData(crmApi: CrmApi): RoutingData {
  const [rules, setRules] = useState<RoutingRule[] | undefined>();
  const [capacity, setCapacity] = useState<CapacityRow[]>([]);
  const [error, setError] = useState<ApiError | undefined>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([crmApi.listRoutingRules(), crmApi.getRoutingCapacity()]).then(
      ([loaded, load]) => {
        if (cancelled) return;
        setRules([...loaded.rules].sort((a, b) => a.priority - b.priority));
        setCapacity(load.items);
        setError(undefined);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : new ApiError(0, 'network_error', ''));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [crmApi, attempt]);

  const reload = useCallback(() => {
    setError(undefined);
    setAttempt((n) => n + 1);
  }, []);

  return { rules, capacity, error, setRules, reload };
}
