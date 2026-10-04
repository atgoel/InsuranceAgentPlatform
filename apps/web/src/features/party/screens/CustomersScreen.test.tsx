import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api/api-error';
import { mockClient, renderAt, type MockClient } from '../../../test/render';
import type { PartyListItem } from '../api';
import { CustomersScreen } from './CustomersScreen';

const user = userEvent.setup({ delay: null });

const ARJUN: PartyListItem = {
  id: 'p_arjun',
  displayName: 'Arjun Reddy',
  primaryMobileMasked: '+91 ••••• ••210',
  householdName: 'Reddy household',
  rolesSummary: ['PROPOSER · Term life', 'INSURED'],
  tags: ['vip'],
  ownerMemberId: 'mem_priya',
};
const FARHAN: PartyListItem = { id: 'p_farhan', displayName: 'Farhan Khan', rolesSummary: [], tags: [] };
const SPOUSE: PartyListItem = { id: 'p_sana', displayName: 'Sana Reddy', rolesSummary: ['NOMINEE'], tags: [] };

const PARTY_DETAIL = {
  id: 'p_arjun',
  household: {
    id: 'hh_1',
    name: 'Reddy household',
    headPartyId: 'p_arjun',
    members: [
      { partyId: 'p_arjun', relation: 'SELF' },
      { partyId: 'p_sana', relation: 'SPOUSE' },
    ],
  },
};

function client(items: PartyListItem[] = [ARJUN, FARHAN]): MockClient {
  return mockClient({
    '/api/v1/parties': (opts: { query?: { householdId?: string } }) =>
      opts.query?.householdId ? { items: [ARJUN, SPOUSE] } : { items },
    '/api/v1/parties/p_arjun': PARTY_DETAIL,
  });
}

function listQueries(c: MockClient): Array<Record<string, unknown>> {
  return c.get.mock.calls
    .filter(([path]) => path === '/api/v1/parties')
    .map(([, opts]) => (opts as { query: Record<string, unknown> }).query);
}

function open(c: MockClient, path = '/crm/customers') {
  return renderAt(<CustomersScreen />, c, path, path);
}

describe('AC-M03-15 CustomersScreen (/crm/customers)', () => {
  it('AC-M03-15 shows the seeded parties as rows with masked mobile, household, translated roles, owner and tags', async () => {
    open(client());
    const row = (await screen.findByText('Arjun Reddy')).closest('tr');
    expect(row?.textContent).toBe('Arjun Reddy+91 ••••• ••210Reddy householdProposer · Term life, Insuredmem_priyavip');
    expect(screen.getByText('Farhan Khan')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 customers')).toBeInTheDocument();
    expect(screen.getByText('Shared numbers never merge people automatically.')).toBeInTheDocument();
  });

  it('AC-M03-15 BUG-11 requests the list once, without a tag, and offers only the All and Tags segments without counts', async () => {
    const c = client();
    const view = open(c);
    await screen.findByText('Arjun Reddy');

    expect(listQueries(c)).toEqual([{ limit: 25 }]);
    const segments = within(screen.getByRole('group', { name: 'Segments' }));
    expect(segments.getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Tags']);
    expect(segments.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(view.container.querySelector('.count-chip-badge')).toBeNull();
    expect(screen.queryByText('With dues')).not.toBeInTheDocument();
    expect(screen.queryByText('No policy')).not.toBeInTheDocument();
    const tags = listQueries(c).map((q) => q.tag);
    expect(tags).not.toContain('with_dues');
    expect(tags).not.toContain('no_policy');
  });

  it('AC-M03-15 the Tags segment shows a tag field and sends it as the tag filter', async () => {
    const c = client();
    open(c);
    await screen.findByText('Arjun Reddy');
    await user.click(screen.getByRole('button', { name: 'Tags' }));
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveAttribute('aria-pressed', 'true');
    await user.type(screen.getByLabelText('Tag'), 'vip');
    await waitFor(() => expect(listQueries(c).at(-1)).toEqual({ tag: 'vip', limit: 25 }));
  });

  it('AC-M03-15 searching sends q and keeps the search box mounted while the list reloads', async () => {
    const c = client();
    open(c);
    await screen.findByText('Arjun Reddy');
    const box = screen.getByLabelText('Search customers');
    await user.type(box, 'Arjun');
    await waitFor(() => expect(listQueries(c).at(-1)).toEqual({ q: 'Arjun', limit: 25 }));
    expect(screen.getByLabelText('Search customers')).toBe(box);
    expect(box).toHaveValue('Arjun');
  });

  it('AC-M03-15 the search box is on screen while the first load is pending', () => {
    const c = mockClient({});
    c.get.mockImplementation(() => new Promise(() => undefined));
    open(c);
    expect(screen.getByLabelText('Search customers')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('AC-M03-15 selecting a row opens the household panel with members, relations and roles', async () => {
    const c = client();
    open(c);
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));

    const panel = within(await screen.findByRole('complementary', { name: 'Household details' }));
    expect(await panel.findByText('Sana Reddy')).toBeInTheDocument();
    expect(panel.getByText('Spouse')).toBeInTheDocument();
    expect(panel.getByText('Self')).toBeInTheDocument();
    expect(panel.getByText('Nominee')).toBeInTheDocument();
    expect(c.get).toHaveBeenCalledWith('/api/v1/parties/p_arjun');
    expect(listQueries(c).at(-1)).toEqual({ householdId: 'hh_1', limit: 25 });
    await user.click(panel.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('AC-M03-15 Open full record goes to the record inside the CRM shell', async () => {
    open(client());
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));
    await user.click(await screen.findByRole('button', { name: 'Open full record' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/crm/customers/p_arjun');
  });

  it('AC-M03-15 D6 under the phone shell the record link stays under /m', async () => {
    open(client(), '/m/customers');
    await user.click(await screen.findByRole('button', { name: 'Arjun Reddy' }));
    await user.click(await screen.findByRole('button', { name: 'Open full record' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/m/customers/p_arjun');
  });

  it('AC-M03-15 an empty list shows the empty state and keeps the filters', async () => {
    open(client([]));
    expect(await screen.findByText('No customers in this view')).toBeInTheDocument();
    expect(screen.getByLabelText('Search customers')).toBeInTheDocument();
  });

  it('AC-M03-15 a server error is shown inline with the filters still on screen, and retry loads the list', async () => {
    let failing = true;
    const c = mockClient({
      '/api/v1/parties': () => {
        if (failing) throw new ApiError(500, 'boom', 'Server error', 'Internal server error', 'trace-123456789');
        return { items: [ARJUN] };
      },
    });
    open(c);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByLabelText('Search customers')).toBeInTheDocument();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Arjun Reddy')).toBeInTheDocument();
  });

  it('AC-M03-15 403 shows the permission state', async () => {
    open(mockClient({ '/api/v1/parties': new ApiError(403, 'forbidden', 'Forbidden') }));
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
  });
});
