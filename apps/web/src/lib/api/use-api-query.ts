import { useEffect, useState, useRef } from 'react';
import { useApi } from './use-api';
import { ApiError } from './api-error';
import { RequestOptions } from './api-client';

export interface UseApiQueryOptions {
  query?: RequestOptions['query'];
}

export interface UseApiQueryResult<T> {
  data?: T;
  error?: ApiError;
  loading: boolean;
  reload(): void;
}

/**
 * Hook for fetching data from the API
 * @param path The API path (null = idle, no request)
 * @param opts Query options
 * @returns Object with data, error, loading state and reload function
 */
export function useApiQuery<T>(
  path: string | null,
  opts?: UseApiQueryOptions,
): UseApiQueryResult<T> {
  const api = useApi();
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const queryKey = opts?.query ? JSON.stringify(opts.query) : '';

  useEffect(() => {
    if (!path) return;

    const load = async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(undefined);

      try {
        const result = await api.get<T>(path, {
          ...opts,
          signal: abortRef.current.signal,
        });
        if (isMountedRef.current) {
          setData(result);
          setError(undefined);
        }
      } catch (cause) {
        if (isMountedRef.current && cause instanceof ApiError) {
          setError(cause);
          setData(undefined);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    load();
  }, [path, queryKey, api, opts]);

  const reload = async () => {
    if (!path) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(undefined);

    try {
      const result = await api.get<T>(path, {
        ...opts,
        signal: abortRef.current.signal,
      });
      if (isMountedRef.current) {
        setData(result);
        setError(undefined);
      }
    } catch (cause) {
      if (isMountedRef.current && cause instanceof ApiError) {
        setError(cause);
        setData(undefined);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  return { data, error, loading, reload };
}
