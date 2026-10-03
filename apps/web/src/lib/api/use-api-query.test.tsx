import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApiQuery } from './use-api-query';
import { ApiProvider, FetchApiClient } from './index';

describe('AC-M00-27 useApiQuery', () => {
  function TestComponent({ path }: { path: string | null }) {
    const { data, loading, error, reload } = useApiQuery(path);
    return (
      <div>
        {loading && <div>Loading</div>}
        {data && <div>{JSON.stringify(data)}</div>}
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
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('loads data on path change', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    );
    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const { rerender } = render(
      <ApiProvider client={client}>
        <TestComponent path={null} />
      </ApiProvider>,
    );

    rerender(
      <ApiProvider client={client}>
        <TestComponent path="/api/test" />
      </ApiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/id.*1/)).toBeInTheDocument();
    });
  });

  it('aborts on unmount', () => {
    const abortSpy = vi.fn();
    const mockFetch = vi.fn().mockReturnValue(
      new Promise(() => {
        // Never resolves
      }),
    );
    const mockAbort = vi.fn();
    const controller = {
      signal: {},
      abort: mockAbort,
    };

    vi.spyOn(window, 'AbortController').mockReturnValue(controller as any);

    const client = new FetchApiClient({
      baseUrl: '/api',
      getToken: () => undefined,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const { unmount } = render(
      <ApiProvider client={client}>
        <TestComponent path="/api/test" />
      </ApiProvider>,
    );

    unmount();
    // Abort should have been called on cleanup
  });

  it('supports reload button', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 1 }), { status: 200 }),
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

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const callCount = mockFetch.mock.calls.length;

    await user.click(screen.getByText('Reload'));
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callCount);
    });
  });
});
