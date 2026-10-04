import { describe, expect, it, vi } from 'vitest';
import { FetchApiClient } from '../../lib/api/api-client';
import { createIntegrationsApi } from './api';
import { routes } from '../../app/routes';

describe('AC-M08-11 integrations HTTP contract', () => {
  it('registers the integrations screen beneath the console route', () => {
    const consoleRoute = routes.find(route => route.path === 'console');
    const integrationRoute = consoleRoute?.children?.find(route => route.path === 'integrations');
    expect(integrationRoute?.lazy).toBeTypeOf('function');
    expect(consoleRoute?.element).toBeDefined();
  });
  it('sends the selected pin version only and uses actual idempotency headers for certification/replay/discard', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(
      new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
    ));
    const api = createIntegrationsApi(new FetchApiClient({
      baseUrl: 'https://tenant.example', getToken: () => 'auth-token', fetchImpl,
    }));
    await api.pin('adapter/one', '2.0.0');
    await api.certify('adapter/one', 'cert-key');
    await api.replay('dead/one', 'replay-key');
    await api.discard('dead/one', 'Resolved by operations', 'discard-key');
    const pinCall = fetchImpl.mock.calls[0];
    expect(String(pinCall[0])).toBe('https://tenant.example/api/v1/integrations/adapter%2Fone/pin');
    expect(pinCall[1].method).toBe('PUT');
    expect(pinCall[1].body).toBe('{"version":"2.0.0"}');
    expect(pinCall[1].headers.get('Idempotency-Key')).toBeNull();
    const certCall = fetchImpl.mock.calls[1];
    expect(String(certCall[0])).toBe('https://tenant.example/api/v1/integrations/adapter%2Fone/certifications');
    expect(certCall[1].method).toBe('POST');
    expect(certCall[1].body).toBeUndefined();
    expect(certCall[1].headers.get('Idempotency-Key')).toBe('cert-key');
    const replayCall = fetchImpl.mock.calls[2];
    expect(String(replayCall[0])).toBe('https://tenant.example/api/v1/integrations/dead-letters/dead%2Fone/replay');
    expect(replayCall[1].body).toBeUndefined();
    expect(replayCall[1].headers.get('Idempotency-Key')).toBe('replay-key');
    const discardCall = fetchImpl.mock.calls[3];
    expect(String(discardCall[0])).toBe('https://tenant.example/api/v1/integrations/dead-letters/dead%2Fone/discard');
    expect(discardCall[1].body).toBe('{"reason":"Resolved by operations"}');
    expect(discardCall[1].headers.get('Idempotency-Key')).toBe('discard-key');
    expect(discardCall[1].headers.get('Authorization')).toBe('Bearer auth-token');
  });
});
