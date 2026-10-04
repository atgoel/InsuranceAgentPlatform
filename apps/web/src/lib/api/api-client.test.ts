import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FetchApiClient } from './api-client';

describe('AC-M00-27 FetchApiClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: FetchApiClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new FetchApiClient({
      baseUrl: 'http://api.test',
      getToken: () => 'test-token',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });
  });

  it('sends Authorization header when token exists', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await client.get('/users');
    expect(mockFetch).toHaveBeenCalled();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('sends traceparent header', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await client.get('/users');
    const [, opts] = mockFetch.mock.calls[0];
    const traceparent = opts.headers.get('traceparent');
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
  });

  it('sends Idempotency-Key on POST', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: '1' }), { status: 201 }),
    );
    await client.post('/users', { name: 'Alice' });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('sends If-Match when provided', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await client.put('/users/1', {}, { ifMatch: 'v123' });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.get('If-Match')).toBe('v123');
  });

  it('maps problem+json to ApiError', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'validation_failed',
          title: 'Invalid input',
          status: 400,
          traceId: 'abc123',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    try {
      await client.get('/users');
    } catch (error) {
      expect(error).toMatchObject({
        status: 400,
        code: 'validation_failed',
        traceId: 'abc123',
      });
      return;
    }
    throw new Error('Should have thrown');
  });

  it('creates network_error on fetch rejection', async () => {
    mockFetch.mockRejectedValue(new Error('Network timeout'));
    try {
      await client.get('/users');
    } catch (error) {
      expect(error).toMatchObject({
        status: 0,
        code: 'network_error',
      });
      return;
    }
    throw new Error('Should have thrown');
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const result = await client.del('/users/1');
    expect(result).toBeUndefined();
  });

  it('calls the global fetch unbound when no fetchImpl is given (browsers reject fetch called on another object)', async () => {
    const browserFetch = vi.fn(function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', browserFetch);
    try {
      const realClient = new FetchApiClient({ baseUrl: 'http://localhost', getToken: () => undefined });
      await expect(realClient.get('/api/v1/me')).resolves.toEqual({ ok: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends query parameters', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    await client.get('/users', { query: { page: 1, limit: 10 } });
    const [url] = mockFetch.mock.calls[0];
    expect(url.toString()).toContain('page=1');
    expect(url.toString()).toContain('limit=10');
  });

  it('calls onError callback on error', async () => {
    const onError = vi.fn();
    const client2 = new FetchApiClient({
      baseUrl: 'http://api.test',
      getToken: () => undefined,
      fetchImpl: mockFetch as unknown as typeof fetch,
      onError,
    });
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'error', title: 'Error', status: 500 }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
    );
    try {
      await client2.get('/users');
    } catch {
      // ignore
    }
    expect(onError).toHaveBeenCalled();
  });
});
