import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { MyWorkItem } from '../api';
import { TodayScreen } from './TodayScreen';
import { MemoryStorage, mockClient, renderAt, type MockClient } from '../../../test/render';

const ITEMS: MyWorkItem[] = [
  { kind: 'HOT_LEAD', id: 'lead_1', title: 'Asha Verma', subtitle: 'TERM_LIFE · +91 98•••••01', priority: 2, subject: { type: 'LEAD', id: 'lead_1' }, actions: ['CALL', 'WHATSAPP', 'OPEN'] },
  { kind: 'BIRTHDAY', id: 'pty_9', title: 'Ravi Kumar', subtitle: 'Turns 40 today', priority: 3, subject: { type: 'PARTY', id: 'pty_9' }, actions: ['OPEN'] },
];
const MY_WORK = { items: ITEMS, counts: { overdue: 2, today: 1, hotLeads: 1 } };
const NOW = new Date('2026-10-03T09:30:00.000Z');
const ACTIVITY = '/api/v1/leads/lead_1/activities';

describe('AC-M04-29 TodayScreen (/m/today)', () => {
  let online = true;
  let storage: MemoryStorage;
  const render = (client: MockClient) => renderAt(<TodayScreen storage={storage} now={() => NOW} />, client, '/m/today');
  const logCall = async (outcome: string) => {
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Asha Verma' })).getByRole('button', { name: 'Log activity' }));
    await userEvent.click(screen.getByRole('button', { name: outcome }));
    await userEvent.click(screen.getByRole('button', { name: 'Save log' }));
  };
  const goOnline = async () => {
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
  };

  beforeEach(() => {
    online = true;
    storage = new MemoryStorage();
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    let n = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-00000000000${(n += 1)}` as `${string}-${string}-${string}-${string}-${string}`);
  });
  afterEach(() => vi.restoreAllMocks());

  it('AC-M04-29 shows counts and the my-work list; Call opens the lead (no number is dialled from this screen)', async () => {
    render(mockClient({ '/api/v1/my-work': MY_WORK }));
    expect(await screen.findByText('Asha Verma')).toBeInTheDocument();
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['2', '1', '1']);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Asha Verma' })).getByRole('button', { name: 'Call' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/m/leads/lead_1');
  });

  it('AC-M04-29 non-lead items can be opened but not logged', async () => {
    render(mockClient({ '/api/v1/my-work': MY_WORK }));
    const birthday = within(await screen.findByRole('listitem', { name: 'Ravi Kumar' }));
    expect(birthday.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(birthday.queryByRole('button', { name: 'Log activity' })).not.toBeInTheDocument();
  });

  it('AC-M04-29 caches only non-sensitive fields of the last response', async () => {
    render(mockClient({ '/api/v1/my-work': MY_WORK }));
    await screen.findByText('Asha Verma');
    expect(storage.snapshot()).toEqual({
      'crm:today-cache:v1': {
        items: ITEMS.map((i) => ({ kind: i.kind, id: i.id, title: i.title, priority: i.priority, subject: i.subject, actions: i.actions })),
        counts: { overdue: 2, today: 1, hotLeads: 1 },
      },
    });
    expect(JSON.stringify(storage.snapshot())).not.toContain('98•••••01');
  });

  it('AC-M04-29 a network failure serves the cached list with the offline banner', async () => {
    storage.setItem('crm:today-cache:v1', JSON.stringify({ items: [{ ...ITEMS[0], subtitle: undefined }], counts: MY_WORK.counts }));
    render(mockClient({ '/api/v1/my-work': ApiError.network(new Error('offline')) }));
    expect(await screen.findByText('You are offline. Showing your last saved list; logs will sync when you reconnect.')).toBeInTheDocument();
    expect(screen.getByText('Asha Verma')).toBeInTheDocument();
  });

  it('AC-M04-29 without a cache a network failure is an error; a 403 is never served from cache', async () => {
    const first = render(mockClient({ '/api/v1/my-work': ApiError.network(new Error('offline')) }));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    first.unmount();
    storage.setItem('crm:today-cache:v1', JSON.stringify(MY_WORK));
    render(mockClient({ '/api/v1/my-work': new ApiError(403, 'forbidden', 'No') }));
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByText('Asha Verma')).not.toBeInTheDocument();
  });

  it('AC-M04-29 online, a call log is sent at once with its clientRef and outcome', async () => {
    const client = mockClient({ '/api/v1/my-work': MY_WORK, [ACTIVITY]: { id: 'act_1' } });
    render(client);
    await screen.findByText('Asha Verma');
    await logCall('No answer');
    expect(client.post).toHaveBeenCalledWith(ACTIVITY, {
      kind: 'CALL', outcome: 'NO_ANSWER', occurredAt: NOW.toISOString(), clientRef: '00000000-0000-4000-8000-000000000001',
    }, expect.objectContaining({ idempotencyKey: expect.any(String) }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(storage.getItem('crm:log-queue:v1')).toBeNull();
  });

  it('AC-M04-29 offline, the log is queued and replayed on reconnect with the same clientRef', async () => {
    const client = mockClient({ '/api/v1/my-work': MY_WORK, [ACTIVITY]: { id: 'act_1' } });
    render(client);
    await screen.findByText('Asha Verma');
    online = false;
    await logCall('Connected');
    expect(client.post).not.toHaveBeenCalled();
    expect(screen.getByText('1 log waiting to sync')).toBeInTheDocument();
    await goOnline();
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post.mock.calls[0]?.[1]).toMatchObject({ clientRef: '00000000-0000-4000-8000-000000000001', outcome: 'CONNECTED' });
    expect(screen.queryByText('1 log waiting to sync')).not.toBeInTheDocument();
  });

  it('AC-M04-29 a server outage keeps the log queued (same clientRef next time); a 400 drops it and says so', async () => {
    const client = mockClient({ '/api/v1/my-work': MY_WORK });
    client.post.mockRejectedValueOnce(new ApiError(503, 'unavailable', 'Down')).mockResolvedValueOnce({ id: 'act_1' }).mockRejectedValueOnce(new ApiError(400, 'invalid', 'Bad'));
    render(client);
    await screen.findByText('Asha Verma');
    await logCall('Call back');
    expect(screen.getByText('1 log waiting to sync')).toBeInTheDocument();
    await goOnline();
    expect(client.post.mock.calls.map((c) => (c[1] as { clientRef: string }).clientRef)).toEqual(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001']);
    await logCall('Wrong number');
    expect(await screen.findByText('1 log was rejected by the server and not saved')).toBeInTheDocument();
    expect(storage.getItem('crm:log-queue:v1')).toBeNull();
  });

  it('AC-M04-29 switches between English and Hindi', async () => {
    render(mockClient({ '/api/v1/my-work': MY_WORK }));
    await screen.findByText('Asha Verma');
    await userEvent.click(screen.getByRole('button', { name: 'हि' }));
    expect(screen.getByRole('button', { name: 'हि' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('शुभ दिन! आज का काम तैयार है।');
    expect(within(screen.getByRole('listitem', { name: 'Asha Verma' })).getByRole('button', { name: 'गतिविधि लॉग करें' })).toBeInTheDocument();
  });
});
