import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useApiQuery } from './use-api-query';
import { ApiProvider, FetchApiClient } from './index';

describe('AC-M00-27 useApiQuery', () => {
  function TestComponent({ path }: { path: string | null }) {
    const { data, loading, error, reload } = useApiQuery<Record<string, unknown>>(path);
    return (
      <div>
        {loading && <div>Loading</div>}
        {data && <div data-testid="data">{JSON.stringify(data)}</div>}
        {error && <div>Error: {error.code}</div>}
        <button onClick={reload}>Reload</button>
      </div>
    );
  }

  it('is idle when path is null', () => {
    const mockFetch = vi.fn();
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    render(
      <ApiProvider client={client}>
        <TestComponent path={null} />
      </ApiProvider>,
    );

    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
  });

  it('provides reload function', () => {
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
    });

    render(
      <ApiProvider client={client}>
        <TestComponent path={null} />
      </ApiProvider>,
    );

    expect(screen.getByText('Reload')).toBeInTheDocument();
  });
});
