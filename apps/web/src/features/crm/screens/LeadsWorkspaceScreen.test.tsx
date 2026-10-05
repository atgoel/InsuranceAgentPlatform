import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import { mockClient, renderAt, type MockClient } from '../../../test/render';
import { LeadsWorkspaceScreen, leadQueryFor } from './LeadsWorkspaceScreen';
import { type LeadListItem, type LeadStats } from '../api';

const OPEN = 'NEW,CONTACTED,QUALIFIED';

const stats: LeadStats = { open: 42, unassigned: 8, slaMetPct7d: 85, leadToIssuedPct90d: 12 };

const rajesh: LeadListItem = {
  id: 'lead-1',
  partyId: 'party-1',
  name: 'Rajesh Kumar',
  mobileMasked: '+91 98XXX XXXXX',
  productInterest: 'TERM_LIFE',
  source: 'WEB_FORM',
  ownerMemberId: 'member-1',
  ownerName: 'Agent Singh',
  stage: 'NEW',
  temperature: 'HOT',
  slaState: 'pending',
  consent: 'granted',
  createdAt: '2026-10-04T05:00:00.000Z',
};

const priya: LeadListItem = {
  id: 'lead-2',
  partyId: 'party-2',
  name: 'Priya Sharma',
  productInterest: 'SAVINGS_LIFE',
  source: 'WALK_IN',
  stage: 'CONTACTED',
  temperature: 'WARM',
  slaState: 'breached',
  consent: 'not_given',
  createdAt: '2026-10-03T05:00:00.000Z',
};

function client(items: LeadListItem[] = [rajesh, priya]): MockClient {
  return mockClient({
    '/api/v1/leads/stats': stats,
    '/api/v1/leads': () => ({ items }),
  });
}

function leadQueries(c: MockClient): Array<Record<string, unknown>> {
  return c.get.mock.calls.filter(([path]) => path === '/api/v1/leads').map(([, opts]) => opts.query);
}

describe('AC-M04-25 LeadsWorkspaceScreen', () => {
  it('AC-M04-25 BUG-10 shows stats counts on All open and Unassigned only, none on SLA breached or Mine', async () => {
    renderAt(<LeadsWorkspaceScreen />, client(), '/crm/leads');
    const views = await screen.findByRole('group', { name: 'Saved views' });
    await waitFor(() => expect(within(views).getByRole('button', { name: /All open/ }).textContent).toBe('All open42'));
    expect(within(views).getByRole('button', { name: /Unassigned/ }).textContent).toBe('Unassigned8');
    expect(within(views).getByRole('button', { name: 'SLA breached' }).textContent).toBe('SLA breached');
    expect(within(views).getByRole('button', { name: 'Mine' }).textContent).toBe('Mine');
  });

  it('AC-M04-25 shows the four KPI tiles from /leads/stats', async () => {
    renderAt(<LeadsWorkspaceScreen />, client(), '/crm/leads');
    await screen.findByText('Rajesh Kumar');
    const values = Array.from(document.querySelectorAll('.kpi-tile-value')).map((node) => node.textContent);
    expect(values).toEqual(['42', '8', '85%', '12%']);
    expect(screen.getByText('Insurer-confirmed only')).toBeInTheDocument();
  });

  it('AC-M04-25 UI-05 BUG-09 BUG-16 row shows labelled codes, a masked-mobile and date sub-line and a router link', async () => {
    renderAt(<LeadsWorkspaceScreen />, client(), '/crm/leads');
    const link = await screen.findByRole('link', { name: 'Rajesh Kumar' });
    expect(link.getAttribute('href')).toBe('/crm/leads/lead-1');
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).getByText('+91 98XXX XXXXX · 4 Oct 2026')).toBeInTheDocument();
    expect(within(row).getByText('Term life')).toBeInTheDocument();
    expect(within(row).getByText('Web form')).toBeInTheDocument();
    expect(within(row).getByText('New')).toBeInTheDocument();
    expect(within(row).getByText('Pending')).toBeInTheDocument();
    expect(within(row).getByText('Granted')).toBeInTheDocument();
    const unowned = screen.getByRole('link', { name: 'Priya Sharma' }).closest('tr') as HTMLElement;
    expect(within(unowned).getByText('3 Oct 2026')).toBeInTheDocument();
    expect(within(unowned).getByText('Savings life')).toBeInTheDocument();
    expect(within(unowned).getByText('Not given')).toBeInTheDocument();
  });

  it('AC-M04-25 UI-05 Import CSV links to /crm/import', async () => {
    renderAt(<LeadsWorkspaceScreen />, client(), '/crm/leads');
    const link = await screen.findByRole('link', { name: 'Import CSV' });
    expect(link.getAttribute('href')).toBe('/crm/import');
  });

  it('AC-M04-25 UI-05 search sends q to the list route after a pause and keeps the box mounted while loading', async () => {
    const c = client();
    renderAt(<LeadsWorkspaceScreen />, c, '/crm/leads');
    const user = userEvent.setup();
    const box = await screen.findByRole('searchbox', { name: 'Search leads' });
    await screen.findByText('Rajesh Kumar');
    c.get.mockImplementation((path: string, opts?: { query?: Record<string, unknown> }) => {
      if (path === '/api/v1/leads/stats') return Promise.resolve(stats);
      return opts?.query?.q === 'raj' ? new Promise(() => undefined) : Promise.resolve({ items: [rajesh, priya] });
    });
    await user.type(box, 'raj');
    await waitFor(() => expect(leadQueries(c).at(-1)).toEqual({ stage: OPEN, q: 'raj', limit: 25 }));
    expect(screen.getByRole('searchbox', { name: 'Search leads' })).toBe(box);
    expect((box as HTMLInputElement).value).toBe('raj');
  });

  it('AC-M04-25 UI-05 owner filter lists owners seen in the list and sends owner=<member id>', async () => {
    const c = client();
    renderAt(<LeadsWorkspaceScreen />, c, '/crm/leads');
    const user = userEvent.setup();
    await screen.findByText('Rajesh Kumar');
    const select = screen.getByLabelText('Owner');
    const labels = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['All owners', 'Unassigned', 'Agent Singh']);
    await user.selectOptions(select, 'member-1');
    await waitFor(() => expect(leadQueries(c).at(-1)).toEqual({ stage: OPEN, owner: 'member-1', limit: 25 }));
  });

  it('AC-M04-32 the grid owner column shows the owner name, never the member id', async () => {
    renderAt(<LeadsWorkspaceScreen />, client(), '/crm/leads');
    const row = (await screen.findByText('Rajesh Kumar')).closest('tr');
    expect(within(row as HTMLElement).getByText('Agent Singh')).toBeInTheDocument();
    expect(row?.textContent).not.toContain('member-1');
  });

  it('AC-M04-25 saved views and the product filter are API queries', async () => {
    const c = client();
    renderAt(<LeadsWorkspaceScreen />, c, '/crm/leads');
    const user = userEvent.setup();
    await screen.findByText('Rajesh Kumar');
    await user.click(screen.getByRole('button', { name: /Unassigned/ }));
    await waitFor(() => expect(leadQueries(c).at(-1)).toEqual({ stage: OPEN, owner: 'unassigned', limit: 25 }));
    await user.selectOptions(screen.getByLabelText('Product'), 'HEALTH');
    await waitFor(() => expect(leadQueries(c).at(-1)).toEqual({ stage: OPEN, owner: 'unassigned', product: 'HEALTH', limit: 25 }));
  });

  it('AC-M04-25 maps saved views to server-side queries', () => {
    expect(leadQueryFor('all_open')).toEqual({ stage: ['NEW', 'CONTACTED', 'QUALIFIED'] });
    expect(leadQueryFor('sla_breached', 'HEALTH')).toEqual({ stage: ['NEW', 'CONTACTED', 'QUALIFIED'], product: 'HEALTH', sla: 'breached' });
    expect(leadQueryFor('mine')).toEqual({ stage: ['NEW', 'CONTACTED', 'QUALIFIED'], owner: 'me' });
    expect(leadQueryFor('mine', undefined, 'member-9', ' raj ')).toEqual({ stage: ['NEW', 'CONTACTED', 'QUALIFIED'], owner: 'member-9', q: 'raj' });
  });

  it('AC-M04-25 shows the empty state when the view has no leads', async () => {
    renderAt(<LeadsWorkspaceScreen />, client([]), '/crm/leads');
    expect(await screen.findByText('No leads in this view')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search leads' })).toBeInTheDocument();
  });

  it('AC-M04-25 a failed list is shown inline with the filters still on screen', async () => {
    const c = mockClient({ '/api/v1/leads/stats': stats, '/api/v1/leads': new ApiError(500, 'boom', 'Server broke') });
    renderAt(<LeadsWorkspaceScreen />, c, '/crm/leads');
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search leads' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Leads' })).toBeInTheDocument();
  });

  it('AC-M04-25 shows Access Denied for a 403', async () => {
    const c = mockClient({ '/api/v1/leads/stats': new ApiError(403, 'forbidden', 'No'), '/api/v1/leads': new ApiError(403, 'forbidden', 'No') });
    renderAt(<LeadsWorkspaceScreen />, c, '/crm/leads');
    expect(await screen.findByText('Access Denied')).toBeInTheDocument();
  });

  it('AC-M04-25 bulk assign posts the selected ids and a failure stays inline', async () => {
    const c = client();
    renderAt(<LeadsWorkspaceScreen />, c, '/crm/leads');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select Rajesh Kumar' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bulk assign' }));
    c.post.mockRejectedValueOnce(new ApiError(422, 'not_licensed', 'Owner is not licensed'));
    await user.type(screen.getByLabelText(/Assign to member/), 'member-7');
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not go through: Owner is not licensed');
    expect(c.post).toHaveBeenCalledWith(
      '/api/v1/leads/bulk-assignments',
      { leadIds: ['lead-1'], memberId: 'member-7' },
      { idempotencyKey: expect.any(String) },
    );
    expect(screen.getByRole('link', { name: 'Rajesh Kumar' })).toBeInTheDocument();
  });

  it('AC-M04-25 opens the new lead form', async () => {
    renderAt(<LeadsWorkspaceScreen />, client(), '/crm/leads');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New lead' }));
    expect(screen.getByRole('button', { name: 'Create and route' })).toBeInTheDocument();
  });
});
