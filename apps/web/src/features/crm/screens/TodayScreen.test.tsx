import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { MyWorkItem } from '../api';
import { TodayScreen } from './TodayScreen';
import { MemoryStorage, mockClient, renderAt, type MockClient } from '../../../test/render';
import { setSession, clearSession } from '../../../lib/auth';

const ITEMS: MyWorkItem[] = [
  {
    kind: 'HOT_LEAD',
    id: 'lead_1',
    title: 'Asha Verma',
    subtitle: 'TERM_LIFE · +91 98•••••01',
    priority: 2,
    subject: { type: 'LEAD', id: 'lead_1' },
    actions: ['CALL', 'WHATSAPP', 'OPEN'],
  },
  {
    kind: 'BIRTHDAY',
    id: 'pty_9',
    title: 'Ravi Kumar',
    subtitle: 'Turns 40 today',
    priority: 3,
    subject: { type: 'PARTY', id: 'pty_9' },
    actions: ['OPEN'],
  },
];
const MY_WORK = { items: ITEMS, counts: { overdue: 2, today: 1, hotLeads: 1 } };
const NOW = new Date('2026-10-03T09:30:00.000Z');
const ACTIVITY = '/api/v1/leads/lead_1/activities';

/** An unsigned JWT-shaped token carrying the one claim the screen reads (name). */
function tokenFor(name: string): string {
  const payload = btoa(JSON.stringify({ name })).replace(/=+$/, '');
  return `header.${payload}.signature`;
}
const DUE_ITEM: MyWorkItem = {
  kind: 'DUE',
  id: 'hp1',
  title: 'Life cover',
  subtitle: 'DUE_TODAY',
  dueAt: '2026-10-05T18:30:00.000Z',
  priority: 1,
  subject: { type: 'HELD_POLICY', id: 'hp1' },
  actions: ['WHATSAPP', 'OPEN'],
};

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
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `00000000-0000-4000-8000-00000000000${(n += 1)}` as `${string}-${string}-${string}-${string}-${string}`,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
    localStorage.removeItem('ui-lang');
  });

  it('AC-M04-29 shows counts and the my-work list; Call opens the lead (no number is dialled from this screen)', async () => {
    render(mockClient({ '/api/v1/my-work': MY_WORK }));
    expect(await screen.findByText('Asha Verma')).toBeInTheDocument();
    expect(screen.getByText('Overdue').parentElement).toHaveTextContent(/^Overdue2$/);
    expect(screen.getByText('Today').parentElement).toHaveTextContent(/^Today1$/);
    expect(screen.getByText('Hot leads').parentElement).toHaveTextContent(/^Hot leads1$/);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/m/leads?new=1', '/m/calculators', '/m/tasks']);
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Asha Verma' })).getByRole('button', { name: 'Call' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/m/leads/lead_1');
  });

  it('AC-M04-29 non-lead items can be opened but not logged', async () => {
    render(mockClient({ '/api/v1/my-work': MY_WORK }));
    const birthday = within(await screen.findByRole('listitem', { name: 'Ravi Kumar' }));
    expect(birthday.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(birthday.queryByRole('button', { name: 'Log activity' })).not.toBeInTheDocument();
  });
  it('AC-M07-09 AC-M07-15 opens due policies in the due calendar and translates book labels', async () => {
    const due: MyWorkItem = {
      kind: 'DUE',
      id: 'hp1',
      title: 'Life cover',
      subtitle: 'DUE_TODAY',
      priority: 1,
      subject: { type: 'HELD_POLICY', id: 'hp1' },
      actions: ['OPEN'],
    };
    const servicing: MyWorkItem = {
      kind: 'TASK',
      id: 'srv1',
      title: 'Servicing — ADDRESS_CHANGE',
      priority: 1,
      subject: { type: 'SERVICING_REQUEST', id: 'srv1' },
      actions: ['OPEN'],
    };
    render(mockClient({ '/api/v1/my-work': { ...MY_WORK, items: [due, servicing] } }));
    expect(await screen.findByText('Due today')).toBeInTheDocument();
    expect(screen.getByText('Servicing tracker · Address change')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('listitem', { name: 'Life cover' })).getByRole('button', { name: 'Open' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/m/dues?policyId=hp1');
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
    expect(
      await screen.findByText('You are offline. Showing your last saved list; logs will sync when you reconnect.'),
    ).toBeInTheDocument();
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
    expect(client.post).toHaveBeenCalledWith(
      ACTIVITY,
      {
        kind: 'CALL',
        outcome: 'NO_ANSWER',
        occurredAt: NOW.toISOString(),
        clientRef: '00000000-0000-4000-8000-000000000001',
      },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
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
    client.post
      .mockRejectedValueOnce(new ApiError(503, 'unavailable', 'Down'))
      .mockResolvedValueOnce({ id: 'act_1' })
      .mockRejectedValueOnce(new ApiError(400, 'invalid', 'Bad'));
    render(client);
    await screen.findByText('Asha Verma');
    await logCall('Call back');
    expect(screen.getByText('1 log waiting to sync')).toBeInTheDocument();
    await goOnline();
    expect(client.post.mock.calls.map((c) => (c[1] as { clientRef: string }).clientRef)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
    ]);
    await logCall('Wrong number');
    expect(await screen.findByText('1 log was rejected by the server and not saved')).toBeInTheDocument();
    expect(storage.getItem('crm:log-queue:v1')).toBeNull();
  });

  it('AC-M04-29 has no language switch of its own (the shell provides it) and follows the chosen language', async () => {
    localStorage.setItem('ui-lang', 'hi');
    render(mockClient({ '/api/v1/my-work': MY_WORK }));
    await screen.findByText('Asha Verma');
    expect(screen.queryByRole('button', { name: 'हि' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'EN' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('नमस्कार');
    expect(
      within(screen.getByRole('listitem', { name: 'Asha Verma' })).getByRole('button', { name: 'गतिविधि लॉग करें' }),
    ).toBeInTheDocument();
  });

  it('UI-04 shows the IST date line and a greeting with the first name from the signed-in token', async () => {
    setSession({ token: tokenFor('Priya Sharma'), tenantId: 'ten_1', roles: ['SALESPERSON'] });
    render(mockClient({ '/api/v1/my-work': MY_WORK }));
    await screen.findByText('Asha Verma');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good afternoon, Priya');
    expect(screen.getByText('3 Oct 2026')).toBeInTheDocument();
  });

  it('UI-04 greets without a name when the token has none; date and greeting follow IST, not UTC', async () => {
    const lateUtc = new Date('2026-10-03T22:00:00.000Z'); // 03:30 on 4 Oct in India
    renderAt(<TodayScreen storage={storage} now={() => lateUtc} />, mockClient({ '/api/v1/my-work': MY_WORK }), '/m/today');
    await screen.findByText('Asha Verma');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Good morning$/);
    expect(screen.getByText('4 Oct 2026')).toBeInTheDocument();
  });

  it('UI-04 search filters my work by title; quick actions link to their screens', async () => {
    render(mockClient({ '/api/v1/my-work': MY_WORK }));
    await screen.findByText('Asha Verma');
    const nav = within(screen.getByRole('navigation', { name: 'Quick actions' }));
    expect(nav.getByRole('link', { name: 'New lead' })).toHaveAttribute('href', '/m/leads?new=1');
    expect(nav.getByRole('link', { name: 'Needs analysis' })).toHaveAttribute('href', '/m/calculators');
    expect(nav.getByRole('link', { name: 'My tasks' })).toHaveAttribute('href', '/m/tasks');
    const box = screen.getByRole('searchbox', { name: 'Search my work' });
    await userEvent.type(box, 'ravi');
    expect(screen.queryByText('Asha Verma')).not.toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    expect(screen.getAllByText('Nothing matches your search')).toHaveLength(2);
  });

  it('BUG-16 UI-04 dues sit in the Dues and renewals card, show the IST date and never a time', async () => {
    const servicing: MyWorkItem = {
      kind: 'TASK',
      id: 'srv1',
      title: 'Servicing — ADDRESS_CHANGE',
      dueAt: '2026-10-05T18:30:00.000Z',
      priority: 1,
      subject: { type: 'SERVICING_REQUEST', id: 'srv1' },
      actions: ['OPEN', 'LOG'],
    };
    render(mockClient({ '/api/v1/my-work': { ...MY_WORK, items: [DUE_ITEM, servicing, ITEMS[0] as MyWorkItem] } }));
    const dues = within(await screen.findByRole('region', { name: 'Dues and renewals' }));
    expect(dues.getByText('Life cover')).toBeInTheDocument();
    expect(dues.queryByText('Asha Verma')).not.toBeInTheDocument();
    expect(dues.getAllByText('6 Oct 2026')).toHaveLength(1);
    expect(dues.getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(dues.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    const work = within(screen.getByRole('region', { name: 'My work' }));
    expect(work.getByText('Servicing tracker · Address change')).toBeInTheDocument();
    expect(work.getByText('6 Oct 2026')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/12:00|midnight|T18:30/i);
  });

  it('BUG-16 an item with a real time of day shows the time in IST', async () => {
    const timed: MyWorkItem = { ...(ITEMS[0] as MyWorkItem), dueAt: '2026-10-03T10:00:00.000Z' };
    render(mockClient({ '/api/v1/my-work': { ...MY_WORK, items: [timed] } }));
    expect(await screen.findByText('3 Oct 2026, 3:30 pm')).toBeInTheDocument();
  });

  it('D4 hides proposal items (their module is not built)', async () => {
    const proposal: MyWorkItem = {
      kind: 'PROPOSAL',
      id: 'prop1',
      title: 'Proposal for Meena',
      priority: 1,
      subject: { type: 'PROPOSAL', id: 'prop1' },
      actions: ['OPEN'],
    };
    render(mockClient({ '/api/v1/my-work': { ...MY_WORK, items: [proposal, ITEMS[0] as MyWorkItem] } }));
    await screen.findByText('Asha Verma');
    expect(screen.queryByText('Proposal for Meena')).not.toBeInTheDocument();
  });
});
