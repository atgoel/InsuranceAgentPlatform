import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import type { LeadListItem } from '../api';
import { MobileLeadsScreen } from './MobileLeadsScreen';
import { mockClient, renderAt } from '../../../test/render';

const lead = (over: Partial<LeadListItem>): LeadListItem => ({
  id: 'lead', partyId: 'pty', name: 'Lead', productInterest: 'TERM_LIFE', source: 'WEB_FORM', stage: 'NEW', temperature: 'WARM', slaState: 'pending',
  consent: 'granted', createdAt: '2026-10-01T00:00:00.000Z', ...over,
});
const LEADS = [
  lead({ id: 'lead_1', name: 'Asha Verma', stage: 'NEW', slaState: 'breached' }),
  lead({ id: 'lead_2', name: 'Ravi Kumar', stage: 'QUALIFIED', productInterest: 'HEALTH_FLOATER' }),
];
const PATH = '/api/v1/leads';
const queries = (get: { mock: { calls: unknown[][] } }) =>
  get.mock.calls.filter((c) => c[0] === PATH).map((c) => (c[1] as { query: Record<string, unknown> }).query);

describe('AC-M04-25 MobileLeadsScreen (/m/leads)', () => {
  it('AC-M04-25 lists open leads as cards with product, stage and SLA chip; a card opens the mobile record', async () => {
    renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: { items: LEADS } }), '/m/leads');
    const asha = (await screen.findByText('Asha Verma')).closest('li') as HTMLElement;
    expect(within(asha).getByText('Term life')).toBeInTheDocument();
    expect(within(asha).getByText('New')).toBeInTheDocument();
    expect(within(asha).getByText('SLA breached')).toBeInTheDocument();
    await userEvent.click(within(asha).getByRole('link'));
    expect(await screen.findByTestId('location')).toHaveTextContent('/m/leads/lead_1');
  });

  it('AC-M04-25 saved views are server queries (same mapping as desktop)', async () => {
    const client = mockClient({ [PATH]: { items: LEADS } });
    renderAt(<MobileLeadsScreen />, client, '/m/leads');
    await screen.findByText('Asha Verma');
    await userEvent.click(screen.getByRole('button', { name: 'Unassigned' }));
    await screen.findByText('Asha Verma');
    expect(queries(client.get).map((q) => [q.stage, q.owner ?? null])).toEqual([
      ['NEW,CONTACTED,QUALIFIED', null],
      ['NEW,CONTACTED,QUALIFIED', 'unassigned'],
    ]);
  });

  it('AC-M04-25 the board groups leads by stage with counts', async () => {
    renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: { items: LEADS } }), '/m/leads');
    await screen.findByText('Asha Verma');
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('region', { name: 'New' })).getByText('Asha Verma')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Qualified' })).getByText('Ravi Kumar')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Contacted' })).getByRole('heading')).toHaveTextContent('Contacted (0)');
  });

  it('AC-M04-25 New lead opens the capture form with the consent notice', async () => {
    renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: { items: LEADS } }), '/m/leads');
    await screen.findByText('Asha Verma');
    await userEvent.click(screen.getByRole('button', { name: 'New lead' }));
    expect(screen.getByRole('checkbox', { name: /consent/i })).toBeInTheDocument();
  });

  it('BUG-10 AC-M04-25 All open and Unassigned show the /leads/stats counts; SLA breached and Mine show none', async () => {
    const stats = { open: 5, unassigned: 3, slaMetPct7d: 75, leadToIssuedPct90d: null };
    renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: { items: LEADS }, '/api/v1/leads/stats': stats }), '/m/leads');
    expect(await screen.findByRole('button', { name: 'All open5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Unassigned3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SLA breached' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mine' })).toBeInTheDocument();
    expect(screen.getByText('5 open leads')).toBeInTheDocument();
  });

  it('BUG-10 a zero count is shown as 0 only when the server says 0; a failed stats call shows no counts and keeps the list', async () => {
    const zero = renderAt(
      <MobileLeadsScreen />,
      mockClient({ [PATH]: { items: LEADS }, '/api/v1/leads/stats': { open: 0, unassigned: 0, slaMetPct7d: null, leadToIssuedPct90d: null } }),
      '/m/leads',
    );
    expect(await screen.findByRole('button', { name: 'All open0' })).toBeInTheDocument();
    zero.unmount();
    renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: { items: LEADS }, '/api/v1/leads/stats': new ApiError(500, 'boom', 'Down') }), '/m/leads');
    expect(await screen.findByText('Asha Verma')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unassigned' })).toBeInTheDocument();
  });

  it('UI-05 search sends q to the server after typing stops, without unmounting the box', async () => {
    const client = mockClient({ [PATH]: { items: LEADS } });
    renderAt(<MobileLeadsScreen />, client, '/m/leads');
    const box = await screen.findByRole('searchbox', { name: 'Search leads' });
    await screen.findByText('Asha Verma');
    await userEvent.type(box, 'ash');
    await waitFor(() => expect(queries(client.get).map((q) => q.q)).toEqual([undefined, 'ash']));
    expect(screen.getByRole('searchbox', { name: 'Search leads' })).toBe(box);
  });

  it('AC-M04-25 shows product and source as labels, never raw codes; ?new=1 opens the new-lead form', async () => {
    renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: { items: LEADS } }), '/m/leads?new=1', '/m/leads');
    const asha = (await screen.findByText('Asha Verma')).closest('li') as HTMLElement;
    expect(within(asha).getByText('Web form')).toBeInTheDocument();
    expect(within(asha).queryByText('WEB_FORM')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /consent/i })).toBeInTheDocument();
  });

  it('AC-M04-25 a failed refresh is shown inline and the page stays', async () => {
    const client = mockClient({ [PATH]: { items: LEADS } });
    renderAt(<MobileLeadsScreen />, client, '/m/leads');
    await screen.findByText('Asha Verma');
    client.get.mockRejectedValueOnce(new ApiError(500, 'boom', 'Search is down'));
    await userEvent.click(screen.getByRole('button', { name: 'Mine' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Leads could not be refreshed: Search is down');
    expect(screen.getByRole('button', { name: 'New lead' })).toBeInTheDocument();
  });

  it('AC-M04-25 empty view and 403 states', async () => {
    const empty = renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: { items: [] } }), '/m/leads');
    expect(await screen.findByText('No leads in this view')).toBeInTheDocument();
    empty.unmount();
    renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: new ApiError(403, 'forbidden', 'No') }), '/m/leads');
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
