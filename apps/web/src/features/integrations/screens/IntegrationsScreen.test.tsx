import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { mockClient, renderAt } from '../../../test/render';
import { ApiError } from '../../../lib/api/api-error';
import { IntegrationsScreen } from './IntegrationsScreen';
import type { AdapterHealth, Certification, DeadLetter } from '../api';
import { integrationMessagesEn, integrationMessagesHi } from '../../../lib/i18n/integration-messages';

const BASE = '/api/v1/integrations';
const KEY = '12345678-1234-4123-8123-123456789012';
const certification: Certification = {
  adapterId: 'fake', adapterVersion: '1.0.0', status: 'FAILED', checkedAt: '2026-10-04T01:00:00Z',
  checks: [
    { kind: 'HAPPY_PATH', passed: true }, { kind: 'DECLINE', passed: true },
    { kind: 'TIMEOUT', passed: true }, { kind: 'DUPLICATE_CALLBACK', passed: true },
    { kind: 'SCHEMA_DRIFT', passed: false, code: 'schema_drift' },
  ],
};
const adapter: AdapterHealth = {
  adapterId: 'fake', adapterVersion: '1.0.0', counterparty: { kind: 'INSURER', insurerId: 'insurer', name: 'Test insurer' },
  pin: { adapterId: 'fake', version: '1.0.0', updatedAt: '2026-10-04T01:00:00Z' },
  breakers: [{ operation: 'GET_STATUS', state: 'HALF_OPEN' }],
  lastProbe: { at: '2026-10-04T02:00:00Z', outcome: 'success', latencyMs: 20, p95Ms: 40, lastOkAt: '2026-10-04T02:00:00Z' },
};
const entry: DeadLetter = {
  id: 'dl1', adapterId: 'fake', adapterVersion: '1.0.0', operation: 'GET_STATUS',
  idempotencyKey: 'original-key', payloadRef: 'payload1', lastError: 'status_timeout', attempts: 3,
  ownerTeam: 'INTEGRATION_OPS', status: 'OPEN', createdAt: '2026-10-04T00:00:00Z', payloadExpiresAt: '2027-04-02T00:00:00Z',
};

function clientWith(routes: Record<string, unknown> = {}, permissions = ['integration.read', 'integration.write']) {
  return mockClient({
    '/api/v1/me': { userRef: 'usr_admin', tenantId: 'tenant_a', roles: ['TENANT_ADMIN'], permissions },
    [BASE]: { items: [adapter] },
    [`${BASE}/dead-letters`]: { items: [entry] },
    [`${BASE}/dead-letters/dl1`]: { entry, payload: { request: 'secret-canary' }, payloadExpired: false },
    ...routes,
  });
}
function mount(client = clientWith()) {
  renderAt(<IntegrationsScreen />, client, '/console/integrations');
  return client;
}
async function inspect() {
  fireEvent.click(await screen.findByRole('button', { name: 'Inspect' }));
  const region = await screen.findByRole('region', { name: 'Failed work detail' });
  await waitFor(() => expect(within(region).queryByText('Loading integrations…')).not.toBeInTheDocument());
  return region;
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(KEY);
});

describe('AC-M08-11 integrations screen', () => {
  it('shows adapter pin, translated breaker/probe diagnostics and exact tenant-free requests', async () => {
    const client = mount();
    const card = await screen.findByRole('article', { name: 'Test insurer' });
    expect(within(card).getByText('Pinned version: 1.0.0')).toBeInTheDocument();
    expect(within(card).getByText('Status query: Circuit testing')).toBeInTheDocument();
    expect(within(card).getByText('Probe p95 40 ms')).toBeInTheDocument();
    expect(within(card).getByText('Last successful probe: 2026-10-04T02:00:00Z')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Inspect' });
    expect(client.get).toHaveBeenCalledWith(BASE);
    expect(client.get).toHaveBeenCalledWith(`${BASE}/dead-letters`, { query: { status: 'OPEN', cursor: undefined, limit: 25 } });
  });

  it('pins the typed version and displays failed certification as a result with checklist and idempotency key', async () => {
    const client = mount(clientWith({ [`${BASE}/fake/certifications`]: certification }));
    client.put.mockResolvedValue({ adapterId: 'fake', version: '2.0.0', updatedAt: '2026-10-04T03:00:00Z' });
    const input = await screen.findByRole('textbox', { name: 'Version to pin' });
    fireEvent.change(input, { target: { value: ' 2.0.0 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pin' }));
    await waitFor(() => expect(client.put).toHaveBeenCalledWith(`${BASE}/fake/pin`, { version: '2.0.0' }));
    await screen.findByText('Pinned version: 2.0.0');
    fireEvent.click(screen.getByRole('button', { name: 'Run certification' }));
    await screen.findByText('Schema change: Failed');
    expect(client.post).toHaveBeenCalledWith(`${BASE}/fake/certifications`, undefined, { idempotencyKey: KEY });
    expect(screen.getByText('Successful request: Passed')).toBeInTheDocument();
    expect(screen.getByText('· schema_drift')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replays synchronously and displays failure plus linked replacement without another replay', async () => {
    const client = mount(clientWith({ [`${BASE}/dead-letters/dl1/replay`]: {
      id: 'dl1', status: 'REPLAYED', result: 'FAILED', replacementId: 'dl2',
    } }));
    const detail = await inspect();
    expect(within(detail).getByLabelText('Payload')).toHaveTextContent('secret-canary');
    fireEvent.click(within(detail).getByRole('button', { name: 'Replay' }));
    await screen.findByText('Replay failed; new failed work created');
    expect(screen.getByText('New failed work reference: dl2')).toBeInTheDocument();
    expect(client.post).toHaveBeenCalledWith(`${BASE}/dead-letters/dl1/replay`, undefined, { idempotencyKey: KEY });
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('shows successful replay separately from failed replay', async () => {
    mount(clientWith({ [`${BASE}/dead-letters/dl1/replay`]: { id: 'dl1', status: 'REPLAYED', result: 'SUCCEEDED' } }));
    await inspect();
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    await screen.findByText('Replay succeeded');
    expect(screen.queryByText(/New failed work reference/)).not.toBeInTheDocument();
  });

  it('requires nonblank discard reason and sends trimmed reason only, preserving reason on failure', async () => {
    const client = mount(clientWith({ [`${BASE}/dead-letters/dl1/discard`]: new ApiError(409, 'dead_letter_closed', 'Entry already closed', undefined, 'trace-discard') }));
    await inspect();
    const reason = screen.getByRole('textbox', { name: 'Discard reason' });
    fireEvent.change(reason, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
    expect(client.post).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: '  operator resolved  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await screen.findByText('Entry already closed');
    expect(screen.getByText('Reference trace-discard')).toBeInTheDocument();
    expect(reason).toHaveValue('  operator resolved  ');
    expect(client.post).toHaveBeenCalledWith(`${BASE}/dead-letters/dl1/discard`, { reason: 'operator resolved' }, { idempotencyKey: KEY });
    expect(screen.getByRole('article', { name: 'Test insurer' })).toBeInTheDocument();
  });

  it('closes discarded work after success and displays recorded reason', async () => {
    const client = mount(clientWith({ [`${BASE}/dead-letters/dl1/discard`]: { id: 'dl1', status: 'DISCARDED' } }));
    await inspect();
    client.get.mockImplementation((path: string) => Promise.resolve(path.endsWith('/dl1')
      ? { entry: { ...entry, status: 'DISCARDED', discardReason: 'Resolved' }, payloadExpired: false }
      : { items: [] }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Discard reason' }), { target: { value: 'Resolved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await screen.findByText('Discard reason: Resolved');
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });

  it('never renders decrypted payload or mutations for a read-only caller even if response contains payload', async () => {
    const client = mount(clientWith({}, ['integration.read']));
    await inspect();
    await screen.findByText('Payload access requires write permission');
    expect(screen.queryByText(/secret-canary/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save pin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run certification' })).not.toBeInTheDocument();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('does not offer replay or discard for terminal work', async () => {
    mount(clientWith({ [`${BASE}/dead-letters/dl1`]: { entry: { ...entry, status: 'REPLAYED' }, payloadExpired: false } }));
    const detail = await inspect();
    expect(within(detail).getByText('Replayed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });

  it('disables expired replay while still allowing a reasoned discard', async () => {
    mount(clientWith({ [`${BASE}/dead-letters/dl1`]: { entry, payloadExpired: true } }));
    await inspect();
    await screen.findByText('Payload expired; replay unavailable');
    expect(screen.getByRole('button', { name: 'Replay' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Discard reason' })).toBeInTheDocument();
  });

  it.each([409, 410, 422])('keeps detail and inline reference after replay error %s', async status => {
    mount(clientWith({ [`${BASE}/dead-letters/dl1/replay`]: new ApiError(status, 'replay_error', 'Replay rejected', undefined, 'trace-replay') }));
    await inspect();
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    await screen.findByText('Replay rejected');
    expect(screen.getByText('Reference trace-replay')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Discard reason' })).toBeInTheDocument();
  });

  it('retains the idempotency key when retrying a failed action', async () => {
    const client = mount();
    client.post.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Network error')).mockResolvedValueOnce(certification);
    await screen.findByRole('button', { name: 'Run certification' });
    fireEvent.click(screen.getByRole('button', { name: 'Run certification' }));
    await screen.findByText('Network error');
    fireEvent.click(screen.getByRole('button', { name: 'Run certification' }));
    await screen.findByText('Schema change: Failed');
    expect(client.post.mock.calls[0][2]).toEqual({ idempotencyKey: KEY });
    expect(client.post.mock.calls[1][2]).toEqual({ idempotencyKey: KEY });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('uses a new certification key after pinning another version following a network failure', async () => {
    const nextKey = '22345678-1234-4123-8123-123456789012';
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(KEY).mockReturnValue(nextKey);
    const client = mount();
    client.post.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Network error'))
      .mockResolvedValueOnce({ ...certification, adapterVersion: '2.0.0' });
    client.put.mockResolvedValue({ adapterId: 'fake', version: '2.0.0', updatedAt: '2026-10-04T03:00:00Z' });
    fireEvent.click(await screen.findByRole('button', { name: 'Run certification' }));
    await screen.findByText('Network error');
    fireEvent.change(screen.getByRole('textbox', { name: 'Version to pin' }), { target: { value: '2.0.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pin' }));
    await screen.findByText('Pinned version: 2.0.0');
    fireEvent.click(screen.getByRole('button', { name: 'Run certification' }));
    await screen.findByText('Failed · 2.0.0');
    expect(client.post).toHaveBeenCalledTimes(2);
    expect(client.post.mock.calls[0][2]).toEqual({ idempotencyKey: KEY });
    expect(client.post.mock.calls[1][2]).toEqual({ idempotencyKey: nextKey });
  });

  it('refreshes the pin and exact-version certification on other cards after changing the same adapter', async () => {
    const secondVersion: AdapterHealth = { ...adapter, adapterVersion: '2.0.0',
      certification: { ...certification, adapterVersion: '2.0.0' } };
    let healthItems = [adapter, secondVersion];
    const client = mount(clientWith({ [BASE]: () => ({ items: healthItems }) }));
    const cards = await screen.findAllByRole('article', { name: 'Test insurer' });
    const firstCard = within(cards[0]);
    const secondCard = within(cards[1]);
    expect(secondCard.getByText('Pinned version: 1.0.0')).toBeInTheDocument();
    expect(secondCard.getByText('Failed · 2.0.0')).toBeInTheDocument();
    const newPin = { adapterId: 'fake', version: '2.0.0', updatedAt: '2026-10-04T03:00:00Z' };
    client.put.mockImplementation(async () => {
      healthItems = healthItems.map(item => ({ ...item, pin: newPin }));
      return newPin;
    });
    fireEvent.change(firstCard.getByRole('textbox', { name: 'Version to pin' }), { target: { value: '2.0.0' } });
    fireEvent.click(firstCard.getByRole('button', { name: 'Save pin' }));
    await waitFor(() => expect(secondCard.getByText('Pinned version: 2.0.0')).toBeInTheDocument());
    const passed: Certification = { ...certification, adapterVersion: '2.0.0', status: 'PASSED',
      checks: certification.checks.map(check => ({ ...check, passed: true, code: undefined })) };
    client.post.mockImplementation(async () => {
      healthItems = healthItems.map(item => item.adapterVersion === '2.0.0' ? { ...item, certification: passed } : item);
      return passed;
    });
    fireEvent.click(firstCard.getByRole('button', { name: 'Run certification' }));
    await waitFor(() => expect(secondCard.getByText('Passed · 2.0.0')).toBeInTheDocument());
    expect(secondCard.queryByText('Failed · 2.0.0')).not.toBeInTheDocument();
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('filters and paginates using exact status/cursor query while keeping filter mounted', async () => {
    const client = mount(clientWith({ [`${BASE}/dead-letters`]: { items: [entry], nextCursor: 'cursor2' } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(client.get).toHaveBeenCalledWith(`${BASE}/dead-letters`, { query: { status: 'OPEN', cursor: 'cursor2', limit: 25 } }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'DISCARDED' } });
    await waitFor(() => expect(client.get).toHaveBeenCalledWith(`${BASE}/dead-letters`, { query: { status: 'DISCARDED', cursor: undefined, limit: 25 } }));
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('DISCARDED');
  });

  it('shows loading then empty adapter and dead-letter states', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const client = clientWith({ [`${BASE}/dead-letters`]: { items: [] } });
    const health = new Promise(value => {
      resolve = value;
    });
    client.get.mockImplementation((path: string) => path === BASE ? health : Promise.resolve({ items: [], permissions: [] }));
    mount(client);
    expect(screen.getByText('Loading integrations…')).toBeInTheDocument();
    resolve({ items: [] });
    await screen.findByText('No adapters available');
    await screen.findByText('No failed work found');
  });

  it.each([403, 500])('shows health error %s and reference without exposing operations', async status => {
    mount(clientWith({ [BASE]: new ApiError(status, 'read_failed', 'Health failed', undefined, 'trace-health') }));
    await screen.findByText(status === 403 ? 'Access denied' : 'Health failed');
    expect(screen.getByText('Reference trace-health')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspect' })).not.toBeInTheDocument();
  });

  it('shows detail access error inline while retaining the health board', async () => {
    mount(clientWith({ [`${BASE}/dead-letters/dl1`]: new ApiError(403, 'forbidden', 'Forbidden', undefined, 'trace-detail') }));
    await inspect();
    await screen.findByText('Access denied');
    expect(screen.getByText('Reference trace-detail')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Test insurer' })).toBeInTheDocument();
  });

  it('renders Hindi labels and has complete Hindi keys for every module English key', async () => {
    localStorage.setItem('ui-lang', 'hi');
    mount(clientWith({ [BASE]: { items: [] }, [`${BASE}/dead-letters`]: { items: [] } }));
    await screen.findByText('कोई एडाप्टर उपलब्ध नहीं');
    expect(screen.getByRole('heading', { name: 'एकीकरण' })).toBeInTheDocument();
    expect(Object.keys(integrationMessagesHi).sort()).toEqual(Object.keys(integrationMessagesEn).sort());
  });

  it('retains pin input and board after an unavailable version error', async () => {
    const client = mount();
    client.put.mockRejectedValue(new ApiError(422, 'adapter_version_unavailable', 'Version unavailable', undefined, 'trace-pin'));
    const input = await screen.findByRole('textbox', { name: 'Version to pin' });
    fireEvent.change(input, { target: { value: '9.0.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pin' }));
    await screen.findByText('Version unavailable');
    expect(input).toHaveValue('9.0.0');
    expect(screen.getByText('Reference trace-pin')).toBeInTheDocument();
    expect(screen.getByText('Pinned version: 1.0.0')).toBeInTheDocument();
  });

  it('shows no pin/probe/certification without inventing p95 and filters all statuses without status value', async () => {
    const client = mount(clientWith({ [BASE]: { items: [{ ...adapter, pin: undefined, lastProbe: undefined }] } }));
    await screen.findByText('Pinned version: Not pinned');
    expect(screen.getByText('No probe yet')).toBeInTheDocument();
    expect(screen.getByText('Not certified')).toBeInTheDocument();
    expect(screen.queryByText(/Probe p95/)).not.toBeInTheDocument();
    await screen.findByRole('button', { name: 'Inspect' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: '' } });
    await waitFor(() => expect(client.get).toHaveBeenCalledWith(`${BASE}/dead-letters`, {
      query: { status: undefined, cursor: undefined, limit: 25 },
    }));
  });

  it('shows list errors inline and keeps the status filter available', async () => {
    mount(clientWith({ [`${BASE}/dead-letters`]: new ApiError(500, 'list_error', 'Failed work unavailable', undefined, 'trace-list') }));
    await screen.findByText('Failed work unavailable');
    expect(screen.getByText('Reference trace-list')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('OPEN');
    expect(screen.getByRole('article', { name: 'Test insurer' })).toBeInTheDocument();
  });
});
