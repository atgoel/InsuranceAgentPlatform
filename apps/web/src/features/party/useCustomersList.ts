import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api/api-error';
import type { createPartyApi, PartyListItem } from './api';

type PartyApi = ReturnType<typeof createPartyApi>;

export interface CustomersQuery {
  q?: string;
  tag?: string;
}

export interface CustomersListState {
  loading: boolean;
  error?: ApiError;
  items: PartyListItem[];
  reload: () => void;
}

/** GET /parties for the current search and tag. The previous rows stay on screen while a new query loads. */
export function useCustomersList(partyApi: PartyApi, query: CustomersQuery): CustomersListState {
  const [items, setItems] = useState<PartyListItem[]>([]);
  const [error, setError] = useState<ApiError | undefined>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const { q, tag } = query;

  useEffect(() => {
    let cancelled = false;
    partyApi.listParties({ q, tag }).then(
      (result) => {
        if (cancelled) return;
        setItems(result.items);
        setError(undefined);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : new ApiError(0, 'network_error', ''));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [partyApi, q, tag, attempt]);

  const reload = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  return { loading, error, items, reload };
}
