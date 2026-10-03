import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
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
const queries = (get: { mock: { calls: unknown[][] } }) => get.mock.calls.map((c) => (c[1] as { query: Record<string, unknown> }).query);

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

  it('AC-M04-25 empty view and 403 states', async () => {
    const empty = renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: { items: [] } }), '/m/leads');
    expect(await screen.findByText('No leads in this view')).toBeInTheDocument();
    empty.unmount();
    renderAt(<MobileLeadsScreen />, mockClient({ [PATH]: new ApiError(403, 'forbidden', 'No') }), '/m/leads');
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
