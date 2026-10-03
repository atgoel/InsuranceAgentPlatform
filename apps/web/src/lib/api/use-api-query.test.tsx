import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApiQuery } from './use-api-query';
import { ApiProvider, FetchApiClient } from './index';
import { ApiError } from './api-error';

describe('AC-M00-27 useApiQuery', () => {
  function TestComponent({ path, query }: { path: string | null; query?: Record<string, string> }) {
    const { data, loading, error, reload } = useApiQuery<Record<string, unknown>>(path, { query });
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

  it('shows loading state when fetching', async () => {
    const mockFetch = vi.fn(() =>
      new Promise(resolve => {
        setTimeout(() => {
          resolve(
            new Response(JSON.stringify({ name: 'Test' }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }, 100);
      }),
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

    expect(screen.getByTestId('loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });
  });

  it('displays data on successful fetch', async () => {
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

    await waitFor(() => {
      expect(screen.getByTestId('data')).toBeInTheDocument();
      expect(screen.getByTestId('data')).toHaveTextContent('Test Data');
    });
  });

  it('displays error state on failed fetch', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ type: 'problem', code: 'NOT_FOUND' }), {
          status: 404,
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
        <TestComponent path="/api/missing" />
      </ApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('error')).toBeInTheDocument();
      expect(screen.getByTestId('error')).toHaveTextContent('NOT_FOUND');
    });
  });

  it('handles reload action', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ count: 1 }), {
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

    const user = userEvent.setup();
    render(
      <ApiProvider client={client}>
        <TestComponent path="/api/test" />
      </ApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('data')).toBeInTheDocument();
    });

    const initialCallCount = mockFetch.mock.calls.length;

    await user.click(screen.getByRole('button', { name: /reload/i }));

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('clears data on 403 error', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ type: 'problem', code: 'PermissionDenied' }), {
          status: 403,
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
        <TestComponent path="/api/forbidden" />
      </ApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('error')).toBeInTheDocument();
      expect(screen.queryByTestId('data')).not.toBeInTheDocument();
    });
  });

  it('cancels previous request when path changes', async () => {
    const mockFetch = vi.fn((url: string) => {
      if (url.includes('/api/slow')) {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(
              new Response(JSON.stringify({ name: 'Slow' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
            );
          }, 200);
        });
      }
      return Promise.resolve(
        new Response(JSON.stringify({ name: 'Fast' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const { rerender } = render(
      <ApiProvider client={client}>
        <TestComponent path="/api/slow" />
      </ApiProvider>,
    );

    // Switch to different path
    rerender(
      <ApiProvider client={client}>
        <TestComponent path="/api/fast" />
      </ApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('Fast');
    });
  });

  it('handles query parameters', async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ filtered: true }), {
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
        <TestComponent path="/api/items" query={{ filter: 'active' }} />
      </ApiProvider>,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl.toString()).toContain('filter=active');
    });
  });
});
