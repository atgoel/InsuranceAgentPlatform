import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api/api-error';

export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : ApiError.network(error instanceof Error ? error : new Error('Request failed'));
}

export function useIntegrationResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError>();
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    const execute = async () => {
      setLoading(true);
      setError(undefined);
      try {
        const value = await load();
        if (!cancelled) {
          setData(value);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(asApiError(cause));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void execute();
    return () => {
      cancelled = true;
    };
  }, [load, revision]);
  return { data, loading, error, reload };
}

export function useIntegrationAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const pendingKeys = useRef(new Map<string, string>());
  const run = async (action: string, execute: (key: string) => Promise<void>) => {
    if (busy) {
      return;
    }
    const key = pendingKeys.current.get(action) ?? crypto.randomUUID();
    pendingKeys.current.set(action, key);
    setBusy(true);
    setError(undefined);
    try {
      await execute(key);
      pendingKeys.current.delete(action);
    } catch (cause) {
      setError(asApiError(cause));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}
