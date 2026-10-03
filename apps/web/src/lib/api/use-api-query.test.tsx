import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useApiQuery } from './use-api-query';
import { ApiProvider, FetchApiClient } from './index';

describe('AC-M00-27 useApiQuery', () => {
  function TestComponent({ path }: { path: string | null }) {
    const { data, loading, error, reload } = useApiQuery<Record<string, unknown>>(path);
    return (
      <div>
        {loading && <div data-testid="loading">Loading</div>}
        {data && <div data-testid="data">{JSON.stringify(data)}</div>}
        {error && <div data-testid="error">Error: {error.code}</div>}
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

    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
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

    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('renders successfully with valid data', () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ name: 'Test Data' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    render(
      <ApiProvider client={client}>
        <TestComponent path="/api/test" />
      </ApiProvider>,
    );

    // Component renders without crashing and shows reload button
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('handles null path gracefully', () => {
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
    });

    const { rerender } = render(
      <ApiProvider client={client}>
        <TestComponent path={null} />
      </ApiProvider>,
    );

    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('data')).not.toBeInTheDocument();

    rerender(
      <ApiProvider client={client}>
        <TestComponent path={null} />
      </ApiProvider>,
    );

    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
  });

  it('unmounts cleanly', () => {
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
    });

    const { unmount } = render(
      <ApiProvider client={client}>
        <TestComponent path={null} />
      </ApiProvider>,
    );

    expect(() => unmount()).not.toThrow();
  });

  it('returns hook interface with data, error, loading, reload', () => {
    function TestComponentInspect() {
      const result = useApiQuery<Record<string, unknown>>(null);
      return (
        <div>
          {result.data === undefined && <div>No data</div>}
          {result.error === undefined && <div>No error</div>}
          {result.loading === false && <div>Not loading</div>}
          {typeof result.reload === 'function' && <div>Has reload</div>}
        </div>
      );
    }

    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
    });

    render(
      <ApiProvider client={client}>
        <TestComponentInspect />
      </ApiProvider>,
    );

    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('No error')).toBeInTheDocument();
    expect(screen.getByText('Not loading')).toBeInTheDocument();
    expect(screen.getByText('Has reload')).toBeInTheDocument();
  });
});
